// 检查是否已经注入
if (window.hasOwnProperty('__TAOBAO_LIVE_HELPER_CONTENT_LOADED__')) {
    console.log('Content script已经注入，跳过');
} else {
    // 标记为已注入
    window.__TAOBAO_LIVE_HELPER_CONTENT_LOADED__ = true;

    console.log('Content script loaded');

    // 创建全局状态对象
    const state = {
        currentUrl: '',
        isProcessing: false,
        lastProcessedUrl: null,
        isCapturing: false,
        processedMessageIds: new Set(),
        maxProcessedMessages: 1000
    };

    // 从URL中提取直播间ID
    function extractLiveId() {
        try {
            // 尝试从URL中获取
            const match = window.location.href.match(/\/(\d+)(?:\?|$)/);
            if (match) {
                state.liveId = match[1];
                return state.liveId;
            }

            // 尝试从页面元素中获取
            const metaElement = document.querySelector('meta[name="room-id"]');
            if (metaElement) {
                state.liveId = metaElement.getAttribute('content');
                return state.liveId;
            }

            // 尝试从全局变量中获取
            if (window.__GLOBAL_DATA__ && window.__GLOBAL_DATA__.roomId) {
                state.liveId = window.__GLOBAL_DATA__.roomId;
                return state.liveId;
            }

            return null;
        } catch (e) {
            console.error('提取直播间ID失败:', e);
            return null;
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

    // 生成消息ID
    function generateMessageId(comment) {
        return `${comment.content}_${comment.timestamp}_${comment.tbNick || comment.publisherNick}_${comment.userId || ''}`; 
    }

    // 清理过期的消息ID
    function cleanupProcessedMessages() {
        if (state.processedMessageIds.size > state.maxProcessedMessages) {
            const messagesArray = Array.from(state.processedMessageIds);
            const keepMessages = messagesArray.slice(Math.floor(messagesArray.length / 2));
            state.processedMessageIds = new Set(keepMessages);
        }
    }

    // 处理评论数据
    function processComments(data) {
        if (!state.isCapturing) {
            console.log('当前未开启捕获，跳过处理弹幕');
            return;
        }

        if (state.isProcessing) {
            console.log('正在处理消息中，跳过重复处理');
            return;
        }

        state.isProcessing = true;

        try {
            // 确保有直播间ID
            if (!state.liveId) {
                state.liveId = extractLiveId();
            }

            // 处理评论
            if (data?.data?.comments?.length > 0) {
                const newComments = [];
                const currentBatch = new Set(); // 用于检测同一批次内的重复

                data.data.comments.forEach(comment => {
                    if (!comment.content || !comment.content.trim()) {
                        return;
                    }

                    const messageId = generateMessageId(comment);
                    
                    // 检查是否在当前批次或历史记录中已存在
                    if (!currentBatch.has(messageId) && !state.processedMessageIds.has(messageId)) {
                        currentBatch.add(messageId);
                        state.processedMessageIds.add(messageId);
                        
                        const commentData = {
                            sender: comment.tbNick || comment.publisherNick || 'unknown',
                            time: formatTimestamp(comment.timestamp),
                            content: comment.content.trim(),
                            liveId: state.liveId || '',
                            userToken: comment.renders?.userToken || '0',
                            userId: comment.userId || ''
                        };
                        
                        newComments.push(commentData);
                    } else {
                        console.log('跳过重复消息:', comment.content);
                    }
                });

                // 只有有新消息时才发送
                if (newComments.length > 0) {
                    console.log('发送新评论数据，数量:', newComments.length);
                    newComments.forEach(commentData => {
                        chrome.runtime.sendMessage({
                            type: 'newComment',
                            data: commentData
                        });
                    });
                }

                // 清理过期消息ID
                cleanupProcessedMessages();
            }
        } catch (e) {
            console.error('处理评论数据失败:', e);
            console.error('原始数据:', data);
        } finally {
            state.isProcessing = false;
        }
    }

    // 监听来自background的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('Content script收到消息:', message);
        
        if (message.type === 'startCapture') {
            state.isCapturing = true;
            state.liveId = extractLiveId();
            state.processedMessageIds.clear();
            state.isProcessing = false;
            console.log('开始捕获弹幕，直播间ID:', state.liveId);
            sendResponse({ status: 'success' });
        } else if (message.type === 'stopCapture') {
            state.isCapturing = false;
            state.isProcessing = false;
            console.log('停止捕获弹幕');
            sendResponse({ status: 'success' });
        }
        
        return true;
    });

    // 注入脚本
    function injectScript() {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('inject.js');
        script.onload = function() {
            console.log('注入脚本加载完成');
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    }

    // 当页面加载时注入脚本
    injectScript();

    // 监听来自页面的消息
    window.addEventListener('message', function(event) {
        // 确保消息来自同源
        if (event.source !== window) return;

        if (event.data.type === 'CAPTURED_URL') {
            state.currentUrl = event.data.url;
            console.log('捕获到URL:', state.currentUrl);
        } else if (event.data.type === 'JSONP_RESPONSE') {
            if (state.isCapturing && !state.isProcessing) {
                processComments(event.data.data);
            } else {
                console.log('未开启捕获或正在处理中，跳过JSONP响应处理');
            }
        }
    });

    // 页面加载完成后尝试提取直播间ID
    window.addEventListener('load', function() {
        state.liveId = extractLiveId();
        console.log('页面加载完成，直播间ID:', state.liveId);
    });
}
