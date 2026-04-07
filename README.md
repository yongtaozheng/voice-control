# Voice Control Desktop

中文语音控制桌面播放器（以网易云音乐为主）的跨平台桌面应用。

当前架构：
- 语音核心：Node.js（Vosk + 规则解析 + 媒体键执行）
- 桌面容器：Tauri（托盘、窗口、生命周期管理）
- 通信方式：Tauri(Rust) <-> Node Daemon（JSON over stdin/stdout）

## 功能
- 中文语音指令：`播放/暂停`、`下一首`、`上一首`、`停止`、`调大音量`、`调小音量`、`静音`
- 可选唤醒词（默认：`音乐助手`）
- 置信度阈值过滤（防误触发）
- 自定义命令词（JSON 覆盖默认短语）
- 托盘运行（关闭窗口不退出）
- CLI 调试模式（不依赖 Tauri UI）

## 目录结构
- `node-src/cli.js`：CLI 入口
- `node-src/service/voiceSession.js`：语音会话编排（ASR + 解析 + 执行）
- `node-src/asr/voskStream.js`：麦克风流式识别（Vosk）
- `node-src/core/parser.js`：指令解析与短语配置加载
- `node-src/executors/windowsMediaExecutor.js`：Windows 媒体键注入（PowerShell + SendInput）
- `node-src/tauri/daemon.js`：Node 守护进程（给 Tauri 调用）
- `node-src/tauri-ui/*`：Tauri 前端页面
- `src-tauri/*`：Tauri Rust 工程
- `config/phrases.example.json`：短语配置示例
- `.github/workflows/build.yml`：CI/CD 工作流

## 环境要求
- Node.js 18.x（推荐 18 LTS；当前不建议 20+，`ffi-napi` 在部分 darwin arm64 环境编译失败）
- Rust stable（Tauri 构建需要）
- Tauri 运行时依赖（按系统安装）
- 麦克风设备

Windows 额外说明：
- 需允许麦克风权限
- 依赖 PowerShell 调用 `SendInput` 注入媒体键

## 安装
```bash
npm install
```

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

约束：
- key 仅可为：
  - `play_pause`
  - `next_track`
  - `prev_track`
  - `stop`
  - `volume_up`
  - `volume_down`
  - `volume_mute`
- value 为字符串数组；配置后会覆盖该命令默认短语

## 配置持久化
- 桌面版：由 Tauri 注入数据目录给 Node daemon，配置文件名固定为：
  - `voice-control-config.json`
- CLI/纯 Node 运行：默认目录为：
  - `~/.voice-control-node/voice-control-config.json`
  - 可通过环境变量 `VC_USER_DATA_DIR` 覆盖

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
产物通常位于：
- `src-tauri/target/*/release/bundle/`

## CI/CD
工作流：`.github/workflows/build.yml`

触发方式：
- `pull_request -> main`：执行检查 + 多平台构建
- `push tag v*`：执行构建并自动创建 GitHub Release
- `workflow_dispatch`：手动触发

构建矩阵：
- macOS x64 / arm64
- Windows x64
- Linux x64

Release 上传产物：
- macOS：`.dmg` / `.tar.gz`
- Windows：`.exe` / `.msi`
- Linux：`.AppImage` / `.deb` / `.rpm`

## 常见问题
- 识别不到语音：检查系统麦克风权限与采样率
- 能识别但不执行：提高命令词匹配度或降低阈值（如 `0.55 -> 0.45`）
- 网易云无响应：确认网易云可响应系统媒体键
- 打包失败：优先检查 Rust toolchain、Tauri 依赖和系统库是否齐全
