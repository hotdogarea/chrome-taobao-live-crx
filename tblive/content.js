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
        lastProcessedUrl: null
    };

    // 格式化时间戳
    function formatTimestamp(timestamp) {
        const date = new Date(parseInt(timestamp));
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    // 处理评论数据
    function processComments(data) {
        try {
            console.log('处理评论数据:', data);

            // 发送API响应数据到popup
            chrome.runtime.sendMessage({
                type: 'apiResponse',
                data: {
                    url: state.currentUrl,
                    response: JSON.stringify(data, null, 2)
                }
            }, response => {
                if (chrome.runtime.lastError) {
                    console.error('发送API响应数据失败:', chrome.runtime.lastError);
                } else {
                    console.log('API响应数据发送成功');
                }
            });

            // 处理评论
            if (data?.data?.comments?.length > 0) {
                data.data.comments.forEach(comment => {
                    if (comment.content && comment.content.trim()) {
                        const commentData = {
                            sender: comment.tbNick || comment.publisherNick,
                            time: formatTimestamp(comment.timestamp),
                            content: comment.content.trim(),
                            liveId: comment.renders?.liveId,
                            userToken: comment.renders?.userToken
                        };
                        
                        console.log('发送评论数据到background:', commentData);
                        chrome.runtime.sendMessage({
                            type: 'newComment',
                            data: commentData
                        }, response => {
                            if (chrome.runtime.lastError) {
                                console.error('发送评论数据失败:', chrome.runtime.lastError);
                            } else {
                                console.log('评论数据发送成功');
                            }
                        });
                    }
                });
            } else {
                console.log('没有新的评论数据');
            }
        } catch (e) {
            console.error('处理评论数据失败:', e);
            console.error('原始数据:', data);
        }
    }

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

        console.log('收到页面消息:', event.data);

        if (event.data.type === 'CAPTURED_URL') {
            const url = event.data.url;
            console.log('content script收到URL:', url);
            state.currentUrl = url;
            
            // 发送URL到background
            chrome.runtime.sendMessage({
                type: 'apiUrl',
                url: url
            }, response => {
                if (chrome.runtime.lastError) {
                    console.error('发送URL到background失败:', chrome.runtime.lastError);
                } else {
                    console.log('URL发送成功');
                }
            });
        } else if (event.data.type === 'JSONP_RESPONSE') {
            console.log('收到JSONP响应:', event.data.data);
            if (!state.isProcessing) {
                state.isProcessing = true;
                processComments(event.data.data);
                state.isProcessing = false;
            }
        }
    });

    // 监听来自background.js的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('Content script收到消息:', message);
        if (message.action === 'getResponseData') {
            console.log('收到获取响应数据请求:', message.url);
            sendResponse({success: true});
        }
        return true;
    });
}
