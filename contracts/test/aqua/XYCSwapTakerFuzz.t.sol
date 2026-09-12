// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {XYCSwap} from "../../contracts/aqua/examples/apps/XYCSwap.sol";
import {BankRockAquaBase} from "./base/BankRockAquaBase.sol";

/**
 * @title XYCSwapTakerFuzz — the third property `specs/19-contract-review-and-hardening.md`
 *        Part 1.2 requires, recorded as missing by audit finding F-13.
 *
 * @dev The periphery must hold nothing after a swap. That is the invariant findings F-5 and F-6
 *      both violated — F-5 by paying out the contract's whole balance, F-6 by letting an app name
 *      an amount the swap never pulled — so it is asserted here over random amounts rather than
 *      at one hand-picked size.
 */
contract XYCSwapTakerFuzzTest is BankRockAquaBase {
    uint256 constant FEE_BPS = 30;

    uint256 constant MAKER_USDC = 5_000 * ONE_USDC;
    uint256 constant MAKER_WETH = 3 * ONE_WETH;
    uint256 constant TAKER_USDC = 1_000_000 * ONE_USDC;
    uint256 constant TAKER_WETH = 1_000 * ONE_WETH;

    uint256 constant SHIP_USDC = 2_000 * ONE_USDC;
    uint256 constant SHIP_WETH = 1 * ONE_WETH;

    XYCSwap.Strategy strategy;

    function setUp() public {
        _deploy(MAKER_USDC, MAKER_WETH, TAKER_USDC, TAKER_WETH);
        strategy = _strategy(ROCK_ID, 0, FEE_BPS);
        _ship(strategy, SHIP_USDC, SHIP_WETH);
    }

    /**
     * @dev Property: after any successful swap in either direction, the periphery holds nothing of
     *      either token, and the caller paid exactly `amountIn` and received exactly `amountOut`.
     *
     *      `amountIn` is bounded to amounts the shipped reserve can actually serve. A swap too
     *      large for the reserve reverts, which is XYCSwap's business rather than this contract's,
     *      and would prove nothing about the invariant.
     */
    function testFuzz_theTakerNeverKeepsABalance(uint96 rawAmountIn, bool zeroForOne) public {
        uint256 amountIn = zeroForOne
            ? (uint256(rawAmountIn) % (500 * ONE_USDC)) + 1
            : (uint256(rawAmountIn) % (ONE_WETH / 4)) + 1;

        uint256 myUsdcBefore = usdc.balanceOf(address(this));
        uint256 myWethBefore = weth.balanceOf(address(this));

        uint256 amountOut = taker.swapExactIn(strategy, zeroForOne, amountIn, 0, address(this), _deadline());

        require(usdc.balanceOf(address(taker)) == 0, "the periphery keeps no USDC");
        require(weth.balanceOf(address(taker)) == 0, "the periphery keeps no WETH");

        if (zeroForOne) {
            require(usdc.balanceOf(address(this)) == myUsdcBefore - amountIn, "paid exactly amountIn");
            require(weth.balanceOf(address(this)) == myWethBefore + amountOut, "received exactly amountOut");
        } else {
            require(weth.balanceOf(address(this)) == myWethBefore - amountIn, "paid exactly amountIn");
            require(usdc.balanceOf(address(this)) == myUsdcBefore + amountOut, "received exactly amountOut");
        }
    }

    /**
     * @dev Property: a stray balance sitting in the periphery is untouched by any swap, whatever
     *      its size. This is F-5 stated as an invariant rather than as a single example.
     */
    function testFuzz_aStrayBalanceIsNeverPaidOut(uint96 strayAmount, uint96 rawAmountIn) public {
        uint256 stray = uint256(strayAmount) % (10_000 * ONE_USDC);
        usdc.mint(address(taker), stray);

        uint256 amountIn = (uint256(rawAmountIn) % (500 * ONE_USDC)) + 1;
        uint256 myUsdcBefore = usdc.balanceOf(address(this));

        taker.swapExactIn(strategy, true, amountIn, 0, address(this), _deadline());

        require(usdc.balanceOf(address(taker)) == stray, "the stray balance is exactly where it was");
        require(usdc.balanceOf(address(this)) == myUsdcBefore - amountIn, "the caller was paid nobody else's money");
    }

    /**
     * @dev Property: the deadline is a hard boundary in both directions — valid at exactly the
     *      deadline second, rejected one second later.
     */
    function testFuzz_theDeadlineBoundaryIsExact(uint32 offset) public {
        uint256 deadline = block.timestamp + 1 hours;
        uint256 target = block.timestamp + (uint256(offset) % 2 hours);
        vm.warp(target);

        try taker.swapExactIn(strategy, true, ONE_USDC, 0, address(this), deadline) {
            require(target <= deadline, "a swap may only succeed at or before its deadline");
        } catch {
            require(target > deadline, "a swap may only fail for lateness after its deadline");
        }
    }
}
