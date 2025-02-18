import asyncio
import json
import websockets
from collections import deque
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)

# 创建一个队列来存储弹幕消息
danmu_queue = deque(maxlen=100)

async def process_message(message_data):
    """处理接收到的消息"""
    try:
        # 解析消息
        message = json.loads(message_data)
        
        if message.get('type') == 'danmu':
            data = message.get('data', {})
            nickname = data.get('nickname', 'unknown')
            content = data.get('content', '')
            time = data.get('time', '')
            live_id = data.get('liveId', '')
            
            # 创建弹幕消息
            danmu = {
                'user': nickname,
                'content': content,
                'time': time,
                'live_id': live_id
            }
            
            # 添加到队列
            danmu_queue.append(danmu)
            
            # 打印接收到的弹幕
            logging.info(f"\n收到弹幕:\n用户: {nickname}\n内容: {content}\n")
            
            # 打印当前队列状态
            logging.info("当前队列状态:")
            if danmu_queue:
                next_danmu = danmu_queue[-1]
                logging.info(f"队列中的下一条弹幕: [{next_danmu['user']}] {next_danmu['content']}")
            logging.info("-" * 50)
            
            return True
    except json.JSONDecodeError as e:
        logging.error(f"JSON解析错误: {e}")
    except Exception as e:
        logging.error(f"处理消息时出错: {e}")
    
    return False

async def websocket_handler(websocket, path):
    """处理WebSocket连接"""
    client_id = id(websocket)
    logging.info(f"新的客户端连接 (ID: {client_id})")
    
    try:
        async for message in websocket:
            success = await process_message(message)
            if not success:
                logging.warning(f"消息处理失败: {message}")
    except websockets.exceptions.ConnectionClosed:
        logging.info(f"客户端断开连接 (ID: {client_id})")
    except Exception as e:
        logging.error(f"处理WebSocket连接时出错: {e}")

async def main():
    """主函数"""
    server = await websockets.serve(
        websocket_handler,
        "127.0.0.1",
        8765,
        ping_interval=None  # 禁用ping以避免一些连接问题
    )
    
    logging.info("WebSocket服务器已启动，监听端口 8765...")
    
    try:
        await server.wait_closed()
    except KeyboardInterrupt:
        logging.info("服务器正在关闭...")
        server.close()
        await server.wait_closed()
        logging.info("服务器已关闭")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("程序已退出")
