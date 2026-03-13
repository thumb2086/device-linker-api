// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title YouJianCoin
 * @dev Standard ERC20 token with minting and burning capabilities for VIP system.
 * The contract owner (admin) can mint tokens for users when they exchange ZXC to YJC,
 * and burn tokens when users cash out.
 */
contract YouJianCoin is ERC20, Ownable, ERC20Burnable {
    constructor(uint256 initialSupply) ERC20("YouJianCoin", "YJC") Ownable(msg.sender) {
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }

    /**
     * @dev Function to mint tokens.
     * @param to The address that will receive the minted tokens.
     * @param amount The amount of tokens to mint.
     */
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    /**
     * @dev Function to burn tokens from a specific account.
     * Only the owner can call this to facilitate cashouts.
     * @param account The address from which to burn tokens.
     * @param amount The amount of tokens to burn.
     */
    function burnFromAdmin(address account, uint256 amount) public onlyOwner {
        _burn(account, amount);
    }
}
