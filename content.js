// 检查是否已经注入
if (window.hasOwnProperty('__TAOBAO_LIVE_HELPER_CONTENT_LOADED__')) {
    console.log('Content script已经注入，跳过');
} else {
    // 标记为已注入
    window.__TAOBAO_LIVE_HELPER_CONTENT_LOADED__ = true;

    console.log('[Content] Content script loaded');

    // 创建全局状态对象
    const state = {
        currentUrl: '',
        isProcessing: false,
        lastProcessedUrl: null,
        isCapturing: false,
        processedMessageIds: new Set(),
        maxProcessedMessages: 1000
    };

    // 生成消息ID
    function generateMessageId(comment) {
        return `${comment.content}_${comment.time}_${comment.nick}_${comment.userId}`;
    }

    // 清理过期的消息ID
    function cleanupProcessedMessages() {
        if (state.processedMessageIds.size > state.maxProcessedMessages) {
            const messagesArray = Array.from(state.processedMessageIds);
            const keepMessages = messagesArray.slice(Math.floor(messagesArray.length / 2));
            state.processedMessageIds.clear();
            keepMessages.forEach(id => state.processedMessageIds.add(id));
        }
    }

    // 格式化时间戳
    function formatTimestamp(timestamp) {
        const date = new Date(parseInt(timestamp));
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    // 处理评论数据
    function processComments(comments) {
        if (!state.isCapturing) {
            console.log('[Content] 未开始捕获，跳过处理');
            return;
        }

        if (state.isProcessing) {
            console.log('[Content] 正在处理中，跳过');
            return;
        }

        if (!Array.isArray(comments)) {
            console.error('[Content] 无效的评论数据格式');
            return;
        }

        try {
            state.isProcessing = true;
            console.log('[Content] 开始处理评论数据，数量:', comments.length);

            // 处理每条评论
            comments.forEach(comment => {
                if (!comment || !comment.content) return;

                const messageId = generateMessageId(comment);
                if (state.processedMessageIds.has(messageId)) {
                    console.log('[Content] 跳过重复消息:', comment.content);
                    return;
                }

                // 添加到已处理集合
                state.processedMessageIds.add(messageId);
                cleanupProcessedMessages();

                // 构造消息对象
                const message = {
                    content: comment.content,
                    sender: comment.nick,
                    userToken: comment.userId,
                    time: formatTimestamp(comment.time),
                    liveId: comment.liveId
                };

                console.log('[Content] 发送新消息:', message);

                // 发送到background
                chrome.runtime.sendMessage({
                    type: 'newComment',
                    data: message
                }, response => {
                    if (chrome.runtime.lastError) {
                        console.error('[Content] 发送消息失败:', chrome.runtime.lastError);
                        return;
                    }
                    if (!response || !response.success) {
                        console.error('[Content] 消息处理失败:', response && response.error);
                    }
                });
            });
        } catch (error) {
            console.error('[Content] 处理评论数据时出错:', error);
        } finally {
            state.isProcessing = false;
        }
    }

    // 注入脚本
    function injectScript() {
        // 等待页面加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                console.log('[Content] 页面加载完成，延迟注入脚本');
                setTimeout(performInjection, 1000);
            });
        } else {
            console.log('[Content] 页面已加载，直接注入脚本');
            setTimeout(performInjection, 1000);
        }
    }

    // 执行脚本注入
    function performInjection() {
        if (document.getElementById('taobao-live-helper-script')) {
            console.log('[Content] 注入脚本已存在，跳过');
            return;
        }

        console.log('[Content] 开始注入脚本');
        const script = document.createElement('script');
        script.id = 'taobao-live-helper-script';
        script.src = chrome.runtime.getURL('inject.js');
        script.onload = () => {
            console.log('[Content] 注入脚本加载完成');
            script.remove();
        };
        script.onerror = (error) => {
            console.error('[Content] 注入脚本加载失败:', error);
            script.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    }

    // 监听来自background的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[Content] 收到消息:', message);
        
        if (message.type === 'startCapture') {
            console.log('[Content] 开始捕获');
            state.isCapturing = true;
            state.processedMessageIds.clear();
            sendResponse({ success: true });
        }
        else if (message.type === 'stopCapture') {
            console.log('[Content] 停止捕获');
            state.isCapturing = false;
            sendResponse({ success: true });
        }
        
        return true;
    });

    // 监听来自页面的消息
    window.addEventListener('message', event => {
        if (event.source !== window) return;
        
        if (event.data.type === 'newComments' && event.data.data) {
            console.log('[Content] 收到页面消息:', event.data);
            processComments(event.data.data);
        }
    });

    // 注入脚本
    injectScript();
    
    console.log('[Content] Content script初始化完成');
}
