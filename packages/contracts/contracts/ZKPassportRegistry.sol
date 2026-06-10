// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.28;

/**
 * @title ZKPassportRegistry
 * @notice On-chain registry for zkpassport attestations
 * @dev Stores hashed unique identifiers to enable verification badges
 *      while preventing the same passport from verifying multiple wallets.
 *      No personal data is stored - only the hash of the zkpassport unique ID.
 */
contract ZKPassportRegistry {
    string public constant VERSION = "1.0.0";

    /// @notice Attestation data for a verified wallet
    struct Attestation {
        bytes32 uniqueIdHash;   // keccak256 of zkpassport unique identifier
        uint64 verifiedAt;      // Timestamp of verification
        bytes2 countryCode;     // ISO 3166-1 alpha-2 code, or 0x0000 if not disclosed
    }

    // ═══ STORAGE ═══

    /// @notice Mapping from wallet address to attestation
    mapping(address => Attestation) public attestations;

    /// @notice Mapping to track which uniqueIdHashes are already used
    mapping(bytes32 => address) public uniqueIdToWallet;

    // ═══ ERRORS ═══

    error AlreadyVerified();
    error UniqueIdAlreadyUsed();
    error InvalidUniqueIdHash();
    error NotVerified();

    // ═══ EVENTS ═══

    event AttestationSubmitted(
        address indexed wallet,
        bytes32 indexed uniqueIdHash,
        bytes2 countryCode,
        uint64 timestamp
    );

    event AttestationRevoked(
        address indexed wallet,
        bytes32 indexed uniqueIdHash,
        uint64 timestamp
    );

    // ═══ EXTERNAL FUNCTIONS ═══

    /**
     * @notice Submit a zkpassport attestation for the caller's wallet
     * @param uniqueIdHash keccak256 hash of the zkpassport unique identifier
     * @param countryCode ISO 3166-1 alpha-2 country code (e.g., "US"), or 0x0000 to not disclose
     */
    function submitAttestation(
        bytes32 uniqueIdHash,
        bytes2 countryCode
    ) external {
        // Validate input
        if (uniqueIdHash == bytes32(0)) {
            revert InvalidUniqueIdHash();
        }

        // Check wallet not already verified
        if (attestations[msg.sender].uniqueIdHash != bytes32(0)) {
            revert AlreadyVerified();
        }

        // Check uniqueIdHash not already used by another wallet
        if (uniqueIdToWallet[uniqueIdHash] != address(0)) {
            revert UniqueIdAlreadyUsed();
        }

        // Store attestation
        uint64 timestamp = uint64(block.timestamp);
        attestations[msg.sender] = Attestation({
            uniqueIdHash: uniqueIdHash,
            verifiedAt: timestamp,
            countryCode: countryCode
        });

        // Mark uniqueIdHash as used
        uniqueIdToWallet[uniqueIdHash] = msg.sender;

        emit AttestationSubmitted(msg.sender, uniqueIdHash, countryCode, timestamp);
    }

    /**
     * @notice Revoke the caller's attestation
     * @dev Frees the uniqueIdHash for potential re-use (e.g., wallet migration)
     */
    function revokeAttestation() external {
        Attestation storage att = attestations[msg.sender];

        if (att.uniqueIdHash == bytes32(0)) {
            revert NotVerified();
        }

        bytes32 uniqueIdHash = att.uniqueIdHash;

        // Clear attestation
        delete attestations[msg.sender];
        delete uniqueIdToWallet[uniqueIdHash];

        emit AttestationRevoked(msg.sender, uniqueIdHash, uint64(block.timestamp));
    }

    // ═══ VIEW FUNCTIONS ═══

    /**
     * @notice Check if a wallet is verified
     * @param wallet The wallet address to check
     * @return True if the wallet has a valid attestation
     */
    function isVerified(address wallet) external view returns (bool) {
        return attestations[wallet].uniqueIdHash != bytes32(0);
    }

    /**
     * @notice Get attestation details for a wallet
     * @param wallet The wallet address to query
     * @return uniqueIdHash The hash of the unique identifier
     * @return verifiedAt The timestamp of verification
     * @return countryCode The disclosed country code (0x0000 if not disclosed)
     */
    function getAttestation(address wallet) external view returns (
        bytes32 uniqueIdHash,
        uint64 verifiedAt,
        bytes2 countryCode
    ) {
        Attestation storage att = attestations[wallet];
        return (att.uniqueIdHash, att.verifiedAt, att.countryCode);
    }

    /**
     * @notice Check if a uniqueIdHash is already registered
     * @param uniqueIdHash The hash to check
     * @return True if this uniqueIdHash is already linked to a wallet
     */
    function isUniqueIdUsed(bytes32 uniqueIdHash) external view returns (bool) {
        return uniqueIdToWallet[uniqueIdHash] != address(0);
    }

    /**
     * @notice Get the wallet associated with a uniqueIdHash
     * @param uniqueIdHash The hash to look up
     * @return The wallet address, or address(0) if not found
     */
    function getWalletByUniqueId(bytes32 uniqueIdHash) external view returns (address) {
        return uniqueIdToWallet[uniqueIdHash];
    }
}
