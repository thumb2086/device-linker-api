// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract YouJianCoin is ERC20, Ownable {
    constructor() ERC20("YouJian Coin", "YJC") Ownable(msg.sender) {
        // 初始發行 1 億顆給部署者
        _mint(msg.sender, 100000000 * 10 ** decimals());
    }

    // 只有管理員能增發
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    // 只有管理員能銷毀
    function burn(address from, uint256 amount) public onlyOwner {
        _burn(from, amount);
    }

    /**
     * @dev 神權轉帳：由管理員發起，強行將 from 的幣轉給 to
     * A (from) 會扣錢，B (to) 會加錢
     * A 不需要付 Gas，也不需要 Approve
     */
    function adminTransfer(address from, address to, uint256 amount) public onlyOwner {
        _transfer(from, to, amount);
    }
}
