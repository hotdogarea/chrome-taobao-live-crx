# Chrome Taobao Live Comments Extension

Chrome扩展，用于捕获和显示淘宝直播评论。
不需要token登录  不需要cookie
交流V:miaomiao210405

## 功能特点

- 实时捕获淘宝直播评论
- 显示用户昵称和用户token
- 显示直播间ID
- 最新评论优先显示
- 支持清除历史数据
- 自动保存评论记录

## 安装说明

1. 下载源代码
2. 打开Chrome浏览器，进入扩展管理页面 (chrome://extensions/)
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目文件夹

## 使用方法

1. 进入淘宝直播页面
2. 点击扩展图标打开控制面板
3. 点击"开始捕获"按钮开始捕获评论
4. 评论会实时显示在面板中
5. 点击"停止捕获"可以停止捕获
6. 使用"清除数据"按钮可以清除历史记录

## 技术说明

- 使用Chrome Extension Manifest V3
- 使用background script进行评论捕获
- 使用popup进行界面展示
- 支持本地数据存储
