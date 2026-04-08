# Voice Control Desktop

中文语音控制桌面播放器（以网易云音乐为主）的 Tauri 应用。

当前架构：
- 语音核心：Node.js（Vosk + 规则解析 + 媒体键执行）
- 桌面容器：Tauri（托盘、窗口、生命周期）
- 进程通信：Rust <-> Node Daemon（stdin/stdout JSON 消息）

## 最新功能（当前实现）
- 桌面设置面板：可保存 `modelPath/wakeWord/sampleRate/device/confidenceThreshold/phraseMapFile`
- 托盘菜单：`打开面板`、`启动监听`、`停止监听`、`退出`
- 关闭主窗口后自动隐藏到托盘，后台保持运行
- Node daemon 长驻，支持状态同步与实时日志推送（`vc:state` / `vc:log`）
- 置信度阈值过滤（低置信度自动跳过）
- 自定义短语映射（JSON 覆盖默认命令词）
- CI 多平台构建与 Tag 自动发布 Release

## 功能清单
- 中文语音命令：
  - `播放/暂停`
  - `下一首`
  - `上一首`
  - `停止`
  - `调大音量`
  - `调小音量`
  - `静音`
- 可选唤醒词（默认：`音乐助手`）
- CLI 调试模式（不依赖 Tauri UI）

## 平台说明
- 项目可在 macOS / Windows / Linux 构建桌面壳。
- **当前媒体键执行器仅实现 Windows**（`node-src/executors/windowsMediaExecutor.js`）。
- 非 Windows 平台点击“启动监听”时会进入错误日志（执行器不支持当前系统）。

## 目录结构
- `node-src/cli.js`：CLI 入口
- `node-src/service/voiceSession.js`：语音会话编排（ASR + 解析 + 执行）
- `node-src/asr/voskStream.js`：麦克风流式识别（Vosk）
- `node-src/core/parser.js`：指令解析与短语配置
- `node-src/executors/windowsMediaExecutor.js`：Windows 媒体键注入（PowerShell + SendInput）
- `node-src/tauri/daemon.js`：Node 守护进程（Tauri 调用）
- `node-src/tauri-ui/*`：Tauri 前端页面
- `src-tauri/*`：Tauri Rust 工程
- `config/phrases.example.json`：短语配置示例
- `.github/workflows/build.yml`：CI/CD 工作流

## 环境要求
- Node.js `>=18 <20`
- Rust stable（用于 Tauri 构建）
- Tauri 运行时依赖（按系统安装）
- 麦克风设备

Windows 额外说明：
- 需开启麦克风权限
- 依赖 PowerShell 脚本调用 `SendInput` 注入媒体键
- `mic` / `vosk` 是可选依赖，Windows 实际运行需确保安装成功

## 安装
```bash
npm install
```

> CI 为了跨平台稳定会使用：`npm install --ignore-scripts`

## 运行方式

### 1) 桌面版（推荐）
```bash
npm run desktop
```
等价于：
```bash
npm run tauri:dev
```

### 2) CLI 模式（调试）
```bash
npm start -- \
  --model-path C:\\models\\vosk-model-small-cn-0.22 \
  --wake-word 音乐助手 \
  --confidence-threshold 0.55 \
  --phrase-map-file config/phrases.example.json
```

CLI 参数：
- `--model-path <path>`：Vosk 模型目录（必填）
- `--wake-word <text>`：唤醒词（可空）
- `--sample-rate <number>`：采样率（默认 `16000`）
- `--device <name_or_id>`：输入设备（可空）
- `--confidence-threshold <0..1>`：置信度阈值（默认 `0.55`）
- `--phrase-map-file <path>`：短语配置文件（可空）

## Vosk 模型
请先下载中文模型并解压，例如：
- `C:\models\vosk-model-small-cn-0.22`

模型路径用于：
- CLI 参数 `--model-path`
- 桌面版设置页中的“Vosk 模型路径”

## 短语配置
示例文件：`config/phrases.example.json`

支持的 key（固定）：
- `play_pause`
- `next_track`
- `prev_track`
- `stop`
- `volume_up`
- `volume_down`
- `volume_mute`

说明：
- value 必须是字符串数组
- 配置后会覆盖该命令默认短语

## 配置持久化
- 桌面版：Tauri 将应用数据目录注入给 Node daemon，文件名固定为：
  - `voice-control-config.json`
- CLI / 纯 Node：默认路径为：
  - `~/.voice-control-node/voice-control-config.json`
- 可通过环境变量覆盖：
  - `VC_USER_DATA_DIR`：覆盖配置目录
  - `VC_NODE_BIN`：Tauri 启动 daemon 时指定 Node 可执行文件

## 测试与检查
```bash
npm run check
npm test
```

## 构建与打包
本地打包：
```bash
npm run tauri:build
```

产物目录通常位于：
- `src-tauri/target/*/release/bundle/`

## CI/CD
工作流：`.github/workflows/build.yml`

触发方式：
- `pull_request -> main`：执行检查 + 多平台构建
- `push tag v*`：执行构建并自动创建 GitHub Release
- `workflow_dispatch`：手动触发

构建矩阵：
- macOS x64（`x86_64-apple-darwin`）
- macOS ARM64（`aarch64-apple-darwin`）
- Windows x64（`x86_64-pc-windows-msvc`）
- Linux x64（`x86_64-unknown-linux-gnu`）

Release 上传产物：
- macOS：`.dmg` / `.app.tar.gz`
- Windows：`.exe` / `.msi`
- Linux：`.AppImage` / `.deb` / `.rpm`

## 常见问题
- 识别不到语音：检查系统麦克风权限、模型路径与采样率
- 能识别但不执行：提高命令词匹配度或降低阈值（如 `0.55 -> 0.45`）
- 网易云无响应：确认网易云可响应系统媒体键
- 非 Windows 无法执行：当前媒体键执行器仅支持 Windows
- 打包失败：优先检查 Rust toolchain、Tauri 依赖和系统库
