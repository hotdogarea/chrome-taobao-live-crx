# 淘宝直播弹幕采集扩展

这是一个用于采集淘宝直播弹幕的Chrome扩展。它可以实时捕获直播间的弹幕消息，并通过WebSocket发送到本地Python服务器进行处理。

## 功能特点

- 实时捕获淘宝直播弹幕
- 自动去重，避免重复消息
- 支持实时显示弹幕内容
- 可以连接本地Python服务器进行数据处理
- 优化的消息处理机制，确保消息传递的可靠性

## 安装步骤

1. 克隆仓库到本地：
   ```bash
   git clone https://github.com/hotdogarea/chrome-taobao-live-crx.git
   ```

2. 安装Python依赖：
   ```bash
   pip install -r requirements.txt
   ```

3. 在Chrome浏览器中加载扩展：
   - 打开Chrome浏览器，进入扩展管理页面（chrome://extensions/）
   - 开启"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目中的 `tblive` 目录

## 使用说明

1. 启动本地服务器：
   ```bash
   python tb_server.py
   ```

2. 打开淘宝直播页面

3. 点击扩展图标，打开控制面板

4. 点击"开始捕获"按钮开始采集弹幕

5. 弹幕会实时显示在扩展的弹窗中，同时发送到本地服务器

## 文件结构

- `manifest.json`: 扩展配置文件
- `background.js`: 后台脚本，处理消息转发和WebSocket连接
- `content.js`: 内容脚本，负责与页面交互
- `inject.js`: 注入脚本，用于获取直播弹幕
- `popup.html/js`: 扩展弹窗界面
- `tb_server.py`: Python后端服务器
- `requirements.txt`: Python依赖列表

## 最新更新

- 优化消息处理逻辑，修复重复消息问题
- 改进WebSocket连接管理
- 增强错误处理机制
- 优化扩展性能和稳定性

## 注意事项

- 确保本地Python服务器（ws://127.0.0.1:8765）正在运行
- 扩展仅在淘宝直播页面生效
- 如遇到连接问题，请检查WebSocket服务器状态
- 建议定期清理缓存数据以保持最佳性能

## 贡献

欢迎提交Issue和Pull Request！

## 许可证

MIT License
