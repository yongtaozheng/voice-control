# 语音控制桌面端 MVP（Node.js / Windows）

当前版本实现：通过中文语音控制系统媒体键，从而控制网易云音乐等支持媒体键的播放器。

## 已实现能力
- 指令：`播放/暂停`、`下一首`、`上一首`、`停止`、`音量+`、`音量-`、`静音`
- 识别：Vosk 离线流式识别（Node）
- 执行：PowerShell + `SendInput` 媒体键注入

## 目录结构
- `node-src/cli.js`：CLI 入口
- `node-src/asr/voskStream.js`：麦克风 + Vosk 识别
- `node-src/core/parser.js`：中文规则解析
- `node-src/core/engine.js`：命令处理引擎
- `node-src/executors/windowsMediaExecutor.js`：Windows 媒体键执行器
- `scripts/send-media-key.ps1`：SendInput 注入脚本

## 运行环境
- Node.js 20+
- Windows 10/11
- 可用麦克风

## 安装
```bash
npm install
```

## 下载 Vosk 中文模型
示例（路径仅示例）：
- `C:\models\vosk-model-small-cn-0.22`

## 运行
```bash
npm start -- --model-path C:\models\vosk-model-small-cn-0.22 --wake-word 音乐助手
```

可选参数：
- `--sample-rate 16000`
- `--device <设备名或设备号>`
- `--confidence-threshold 0.55`（0 到 1，默认 0.55，低于阈值将忽略）
- `--phrase-map-file config/phrases.example.json`（自定义命令同义词）

## 自定义命令词
- 示例文件：`config/phrases.example.json`
- key 必须是以下命令之一：`play_pause`、`next_track`、`prev_track`、`stop`、`volume_up`、`volume_down`、`volume_mute`
- value 为短语数组，会覆盖该命令默认短语

## 本地检查
```bash
npm run check
npm test
```

## Electron 托盘版
运行桌面端（托盘 + 设置窗口 + 日志）：
```bash
npm run desktop
```

说明：
- 关闭窗口不会退出应用，会最小化到托盘。
- 托盘菜单可执行“启动监听/停止监听/退出”。
- 配置会保存到 Electron `userData` 目录下的 `voice-control-config.json`。

## 常见问题
- 识别不到声音：检查 Windows 麦克风权限是否允许桌面应用访问。
- 命令执行了但播放器无响应：确认播放器支持系统媒体键；网易云一般支持。
- PowerShell 被策略限制：执行器已使用 `-ExecutionPolicy Bypass` 单次放行；若企业策略禁止需管理员放开。
