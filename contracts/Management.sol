// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

// Minimal interface to talk to UserAuth contract
interface IUserAuth {
    function getRole(address user) external view returns (uint8);
    function getPubKey(address user) external view returns (string memory);
}

contract Management {
    IUserAuth public auth;
    address public admin;

   // --- Replace the Evidence struct with this ---
struct Evidence {
    string fileCID;
    string description;
    string mimeType;      // NEW: MIME type, e.g., "image/jpeg"
    uint256 timestamp;
    address addedBy;
}

    // caseId -> owner
    mapping(uint256 => address) public caseOwner;
    // caseId -> evidence array
    mapping(uint256 => Evidence[]) public evidences;

    // Option A: store encrypted AES key on-chain per case per user
    mapping(uint256 => mapping(address => string)) private caseAccessKeys;
    mapping(uint256 => mapping(address => bool)) public hasAccess;

    event CaseCreated(uint256 indexed caseId, address indexed owner);
    event EvidenceAdded(uint256 indexed caseId, uint256 indexed idx, string fileCID, address indexed addedBy);
    event AccessGranted(uint256 indexed caseId, address indexed grantee, address indexed grantedBy);
    event AccessRevoked(uint256 indexed caseId, address indexed grantee, address indexed revokedBy);

    modifier onlyCaseOwner(uint256 caseId) {
        require(caseOwner[caseId] == msg.sender, "Not case owner");
        _;
    }

    modifier caseExists(uint256 caseId) {
        require(caseOwner[caseId] != address(0), "Case does not exist");
        _;
    }

    constructor(address authAddr) {
        auth = IUserAuth(authAddr);
        admin = msg.sender;
    }

    // Investigator creates a case
    function createCase(uint256 caseId) external {
        require(caseOwner[caseId] == address(0), "Case exists");
        caseOwner[caseId] = msg.sender;
        emit CaseCreated(caseId, msg.sender);
    }

    // --- Replace the addEvidence function with this ---
function addEvidence(
    uint256 caseId,
    string calldata fileCID,
    string calldata description,
    string calldata mimeType
) external caseExists(caseId) {
    uint8 role = auth.getRole(msg.sender);
    require(msg.sender == caseOwner[caseId] || role == 3 || role == 1, "No permission to add evidence");
    evidences[caseId].push(Evidence(fileCID, description, mimeType, block.timestamp, msg.sender));
    emit EvidenceAdded(caseId, evidences[caseId].length - 1, fileCID, msg.sender);
}

    // Grant access: store encrypted AES key (base64) for grantee on-chain
    function grantAccess(uint256 caseId, address grantee, string calldata encryptedAESKey) external caseExists(caseId) onlyCaseOwner(caseId) {
        require(grantee != address(0), "Invalid grantee");
        caseAccessKeys[caseId][grantee] = encryptedAESKey;
        hasAccess[caseId][grantee] = true;
        emit AccessGranted(caseId, grantee, msg.sender);
    }

    // Revoke access: remove mapping and mark false
    function revokeAccess(uint256 caseId, address grantee) external caseExists(caseId) onlyCaseOwner(caseId) {
        require(hasAccess[caseId][grantee], "User has no access");
        hasAccess[caseId][grantee] = false;
        delete caseAccessKeys[caseId][grantee];
        emit AccessRevoked(caseId, grantee, msg.sender);
    }

    // Grantee retrieves their encrypted AES key (view)
    function getMyEncryptedKey(uint256 caseId) external view caseExists(caseId) returns (string memory) {
        require(hasAccess[caseId][msg.sender] || caseOwner[caseId] == msg.sender || auth.getRole(msg.sender) == 1, "Not authorized");
        return caseAccessKeys[caseId][msg.sender];
    }

    // Read evidence metadata
    function getEvidence(uint256 caseId, uint256 idx) external view caseExists(caseId) returns (Evidence memory) {
        require(idx < evidences[caseId].length, "Invalid index");
        return evidences[caseId][idx];
    }

    function getEvidenceCount(uint256 caseId) external view caseExists(caseId) returns (uint256) {
        return evidences[caseId].length;
    }
}