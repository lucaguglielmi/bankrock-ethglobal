// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ISafeOwnerManager
 * @author Bank Rock
 *
 * @notice The one function `BankRockRegistry` ever calls on a Rock Account: the `isOwner` view
 *         that Safe's `OwnerManager` exposes. The registry uses it to ask an account whether the
 *         rock's current owner can still sign for it.
 *
 * @dev Declared here rather than imported from the Safe packages so the registry carries no Safe
 *      dependency and no Safe version pin. Any account that answers `isOwner(address)` truthfully
 *      can serve as a Rock Account; anything else — a plain EOA, a contract without the function,
 *      a reverting implementation — is simply never accepted as a controller, which fails closed.
 *
 * @custom:security-contact security@bank-rock.com
 */
interface ISafeOwnerManager {
    /**
     * @notice Whether an address is one of this account's signing owners.
     * @param owner The address to test.
     * @return isAnOwner True when `owner` can sign for this account.
     */
    function isOwner(address owner) external view returns (bool isAnOwner);
}
