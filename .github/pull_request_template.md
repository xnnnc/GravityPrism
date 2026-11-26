## Summary / 变更概述
- 

## Verification Checklist / 自检清单
- [ ] `npm run test:gates` 与 `npm test` 全部通过（`0 fail`）
- [ ] Channel 1 全 9 语种打包体积 `< 549,500 B`、`pulse-vial-bridge.js` `< 31,000 B`、`style.css` 0 `:has()` 且纯 ASCII
- [ ] 新测试已归入对应模块域文件（无新增 `v10x-*` / `issueXX-*` 版本号测试文件）且根目录无新增散落文件
- [ ] 零明文 API Key、私有 URL、个人本机路径或私密标识
- [ ] 完整保留 `GPL-3.0` 协议、`NOTICE` 与 `THIRD_PARTY_NOTICES.md` 致谢链
