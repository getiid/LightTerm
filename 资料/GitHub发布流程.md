# GitHub 发布流程（AstraShell）

## 1. 提交代码
```bash
cd /Users/jonny/Desktop/AstraShell
git add -A
git commit -m "feat: UI polish, SFTP dual-pane improvements and snippets runner"
git push origin main
```

## 2. 生成安装包（含自动更新元数据）
```bash
cd /Users/jonny/Desktop/AstraShell/app
npm run build
env -u ALL_PROXY -u HTTPS_PROXY -u HTTP_PROXY -u all_proxy -u https_proxy -u http_proxy \
  npx electron-builder --mac --arm64 --publish never
```

输出文件：
- `app/release/AstraShell-<version>-arm64.dmg`
- `app/release/AstraShell-<version>-arm64.dmg.blockmap`
- `app/release/AstraShell-<version>-arm64-mac.zip`
- `app/release/AstraShell-<version>-arm64-mac.zip.blockmap`
- `app/release/latest-mac.yml`（自动更新关键文件）

说明：
- 当前配置默认 `mac.identity = null`，会跳过签名，优先保证可打包可运行。
- 自动更新必须保证 `latest-mac.yml` 与对应 zip/dmg 一起上传到同一 GitHub Release。

## 3. 发布 GitHub Release
```bash
cd /Users/jonny/Desktop/AstraShell
git tag -a vX.Y.Z -m "AstraShell vX.Y.Z"
git push origin vX.Y.Z
env -u ALL_PROXY -u HTTPS_PROXY -u HTTP_PROXY -u all_proxy -u https_proxy -u http_proxy \
  gh release create vX.Y.Z \
  app/release/latest-mac.yml \
  app/release/AstraShell-X.Y.Z-arm64-mac.zip \
  app/release/AstraShell-X.Y.Z-arm64-mac.zip.blockmap \
  app/release/AstraShell-X.Y.Z-arm64.dmg \
  app/release/AstraShell-X.Y.Z-arm64.dmg.blockmap \
  --title "AstraShell vX.Y.Z" \
  --notes "Desktop release with auto-update support."
```

## 4. 验证点
- `gh release view vX.Y.Z` 能看到 `latest-mac.yml` 和 zip/dmg 资产。
- 已安装旧版本客户端启动后可发现更新，并可“一键下载 + 重启安装”。
- 在一台干净 macOS 设备下载 DMG，验证可安装、可启动、可连接 SSH。

## 5. 重要前提
- 当前仓库是私有仓库时，客户端检查更新需要可访问 GitHub API（通常需配置 `GH_TOKEN`/`GITHUB_TOKEN`）。
- 若希望所有用户免配置自动更新，建议使用公开仓库 Release 或单独的公开更新源。
