// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAqua} from "../../../contracts/aqua/src/interfaces/IAqua.sol";
import {Aqua} from "../../../contracts/aqua/src/Aqua.sol";
import {XYCSwap} from "../../../contracts/aqua/examples/apps/XYCSwap.sol";
import {XYCSwapTaker} from "../../../contracts/aqua/XYCSwapTaker.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/**
 * @dev The subset of the EDR / forge cheatcode interface these tests use, declared locally in
 *      exactly the style of `test/BankRockRegistry.t.sol`.
 */
interface Vm {
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function warp(uint256 timestamp) external;
}

/**
 * @title BankRockAquaBase — shared fixture for the Aqua integration tests
 *
 * @dev The deployment here mirrors the Sepolia one exactly, with one substitution: `Aqua` is the
 *      vendored copy rather than the canonical deployment at `0x1111113ccf…6a90a`. We never
 *      deploy Aqua ourselves on a real network (spec 16 §1.1); the local copy exists so the tests
 *      can run against byte-identical source.
 *
 *      Roles:
 *        MAKER  — the Rock Account. Holds the real ERC-20 balances and approves *Aqua* (not the
 *                 app) once, for everything (spec 16 §1.5 item 2).
 *        this   — the visitor/taker. Approves `XYCSwapTaker`, which is the only way an account
 *                 without an `IXYCSwapCallback` implementation can trade (see XYCSwapTaker.sol).
 */
abstract contract BankRockAquaBase {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @dev keccak256("bankrock.aqua.strategy.v1") — the domain separator of the strategy salt.
    bytes32 internal constant SALT_DOMAIN = keccak256("bankrock.aqua.strategy.v1");

    address internal constant MAKER = address(0x00000000000000000000000000000000000000A1);

    uint256 internal constant ROCK_ID = 42;

    /// 6 decimals, like Circle's Sepolia USDC.
    uint256 internal constant ONE_USDC = 1e6;
    /// 18 decimals, like Sepolia WETH.
    uint256 internal constant ONE_WETH = 1e18;

    Aqua internal aqua;
    XYCSwap internal app;
    XYCSwapTaker internal taker;
    MockERC20 internal usdc;
    MockERC20 internal weth;

    function _deploy(uint256 makerUsdc, uint256 makerWeth, uint256 takerUsdc, uint256 takerWeth) internal {
        aqua = new Aqua();
        app = new XYCSwap(IAqua(address(aqua)));
        taker = new XYCSwapTaker(IAqua(address(aqua)), app);

        usdc = new MockERC20("USD Coin", "USDC", 6);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);

        usdc.mint(MAKER, makerUsdc);
        weth.mint(MAKER, makerWeth);
        usdc.mint(address(this), takerUsdc);
        weth.mint(address(this), takerWeth);

        // The maker approves Aqua once, for every strategy it will ever ship.
        vm.startPrank(MAKER);
        usdc.approve(address(aqua), type(uint256).max);
        weth.approve(address(aqua), type(uint256).max);
        vm.stopPrank();

        // The taker approves the periphery, not Aqua and not the app.
        usdc.approve(address(taker), type(uint256).max);
        weth.approve(address(taker), type(uint256).max);
    }

    /* ------------------------------------------------------------------ */
    /* Strategy construction — the encoding lib/aqua mirrors in TypeScript  */
    /* ------------------------------------------------------------------ */

    /// @dev salt = keccak256(abi.encode(SALT_DOMAIN, rockId, streamIndex)) — "rock identity as
    ///      strategy salt" (spec 04), with `streamIndex` distinguishing several streams of one
    ///      rock over the same reserve.
    function _salt(uint256 rockId, uint256 streamIndex) internal pure returns (bytes32) {
        return keccak256(abi.encode(SALT_DOMAIN, rockId, streamIndex));
    }

    function _strategy(uint256 rockId, uint256 streamIndex, uint256 feeBps)
        internal
        view
        returns (XYCSwap.Strategy memory)
    {
        return XYCSwap.Strategy({
            maker: MAKER,
            token0: address(usdc),
            token1: address(weth),
            feeBps: feeBps,
            salt: _salt(rockId, streamIndex)
        });
    }

    function _hash(XYCSwap.Strategy memory strategy) internal pure returns (bytes32) {
        return keccak256(abi.encode(strategy));
    }

    /// @dev The maker ships: `Aqua.ship(app, abi.encode(strategy), [usdc, weth], [a, b])`.
    function _ship(XYCSwap.Strategy memory strategy, uint256 usdcAmount, uint256 wethAmount)
        internal
        returns (bytes32 strategyHash)
    {
        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(weth);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = usdcAmount;
        amounts[1] = wethAmount;

        vm.prank(MAKER);
        strategyHash = aqua.ship(address(app), abi.encode(strategy), tokens, amounts);
    }

    function _dock(bytes32 strategyHash) internal {
        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(weth);
        vm.prank(MAKER);
        aqua.dock(address(app), strategyHash, tokens);
    }

    /// @dev The reference constant-product-with-fee calculation, copied from XYCSwap's
    ///      `_quoteExactIn`. The TypeScript `quote()` in web/src/lib/aqua mirrors this exactly.
    function _expectedOut(uint256 balanceIn, uint256 balanceOut, uint256 amountIn, uint256 feeBps)
        internal
        pure
        returns (uint256)
    {
        uint256 amountInWithFee = (amountIn * (10_000 - feeBps)) / 10_000;
        return (amountInWithFee * balanceOut) / (balanceIn + amountInWithFee);
    }

    /// @dev Virtual balances, straight from Aqua. Reverts if the strategy is not active.
    function _virtual(bytes32 strategyHash) internal view returns (uint256 vUsdc, uint256 vWeth) {
        return aqua.safeBalances(MAKER, address(app), strategyHash, address(usdc), address(weth));
    }

    /// @dev A generous swap deadline for tests that are not about deadlines (XYCSwapTaker F-8).
    function _deadline() internal view returns (uint256) {
        return block.timestamp + 300;
    }

    function _selector(bytes memory reason) internal pure returns (bytes4 sel) {
        if (reason.length < 4) return bytes4(0);
        assembly {
            sel := mload(add(reason, 0x20))
        }
    }
}
