// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {CommuneOS} from "../vendor/commune-os/CommuneOS.sol";

/// Deploys the vendored share-house.fun CommuneOS suite (communetxyz/commune-os-sc).
/// colive.fun uses it as the optional on-chain chore log: collateralRequired is
/// always false in our integration, so the collateral token is inert but the
/// constructor wants one — default to the token share-house.fun's Gnosis config uses.
contract DeployCommuneOS is Script {
    function run() external {
        address token = vm.envOr("COLLATERAL_TOKEN", 0xa555d5344f6FB6c65da19e403Cb4c1eC4a1a5Ee3);
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        new CommuneOS(token);
        vm.stopBroadcast();
    }
}
