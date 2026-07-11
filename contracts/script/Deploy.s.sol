// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {GatheringEscrow} from "../src/GatheringEscrow.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        new GatheringEscrow();
        vm.stopBroadcast();
    }
}
