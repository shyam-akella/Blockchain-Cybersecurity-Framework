// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract UserAuth {
    // role mapping: 0 = none, 1 = Admin, 2 = Investigator, 3 = Forensic, 4 = Judge, 5 = Jury
    mapping(address => uint8) public roles;
    // optional: store user's public RSA key (PEM or base64) so others can fetch it
    mapping(address => string) public pubKeyPEM;

    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        roles[msg.sender] = 1; // deployer = admin
    }

    // Admin registers users and optionally stores their public key
    function registerUser(address user, uint8 role, string calldata pubKey) external onlyOwner {
        require(role >= 1 && role <= 5, "Invalid role");
        roles[user] = role;
        pubKeyPEM[user] = pubKey;
    }

    function getRole(address user) external view returns (uint8) {
        return roles[user];
    }

    function getPubKey(address user) external view returns (string memory) {
        return pubKeyPEM[user];
    }

    // Allow users to update their own public key
    function updateMyPubKey(string calldata newPubKey) external {
        pubKeyPEM[msg.sender] = newPubKey;
    }
}