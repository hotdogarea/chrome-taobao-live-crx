// 检查是否已经注入
if (window.hasOwnProperty('__TAOBAO_LIVE_HELPER_INJECT_LOADED__')) {
    console.log('注入脚本已加载，跳过');
} else {
    // 标记为已注入
    window.__TAOBAO_LIVE_HELPER_INJECT_LOADED__ = true;

    console.log('注入脚本开始加载');

    // 初始化全局对象
    window.__TAOBAO_LIVE_HELPER__ = {
        lastProcessedData: null,
        processedMessages: new Set(),
        maxProcessedMessages: 1000,
        isProcessing: false
    };

    // 清理过期的消息ID
    function cleanupProcessedMessages() {
        const processedMessages = window.__TAOBAO_LIVE_HELPER__.processedMessages;
        if (processedMessages.size > window.__TAOBAO_LIVE_HELPER__.maxProcessedMessages) {
            const messagesArray = Array.from(processedMessages);
            const keepMessages = messagesArray.slice(Math.floor(messagesArray.length / 2));
            window.__TAOBAO_LIVE_HELPER__.processedMessages = new Set(keepMessages);
        }
    }

    // 生成消息ID
    function generateMessageId(comment) {
        return `${comment.content}_${comment.timestamp}_${comment.tbNick || comment.publisherNick}_${comment.userId || ''}`; 
    }

    // 检查数据是否重复
    function isDataDuplicate(data) {
        if (!window.__TAOBAO_LIVE_HELPER__.lastProcessedData) {
            window.__TAOBAO_LIVE_HELPER__.lastProcessedData = data;
            return false;
        }

        const lastData = window.__TAOBAO_LIVE_HELPER__.lastProcessedData;
        const isDuplicate = JSON.stringify(data) === JSON.stringify(lastData);
        
        if (!isDuplicate) {
            window.__TAOBAO_LIVE_HELPER__.lastProcessedData = data;
        }
        
        return isDuplicate;
    }

    // 处理JSONP响应
    window.__processJSONPResponse = function(data) {
        // 检查是否正在处理中
        if (window.__TAOBAO_LIVE_HELPER__.isProcessing) {
            console.log('[Inject] 正在处理消息中，跳过');
            return;
        }

        // 检查数据有效性
        if (!data || !data.data || !data.data.comments) {
            console.log('[Inject] 无效的数据格式');
            return;
        }

        // 检查是否是重复的数据包
        if (isDataDuplicate(data)) {
            console.log('[Inject] 跳过重复的数据包');
            return;
        }

        try {
            window.__TAOBAO_LIVE_HELPER__.isProcessing = true;

            const comments = data.data.comments;
            const newComments = [];
            const currentBatch = new Set(); // 用于检测同一批次内的重复

            comments.forEach(comment => {
                if (!comment.content || !comment.content.trim()) {
                    return;
                }

                const messageId = generateMessageId(comment);
                
                // 检查是否在当前批次或历史记录中已存在
                if (!currentBatch.has(messageId) && !window.__TAOBAO_LIVE_HELPER__.processedMessages.has(messageId)) {
                    currentBatch.add(messageId);
                    window.__TAOBAO_LIVE_HELPER__.processedMessages.add(messageId);
                    newComments.push(comment);
                } else {
                    console.log('[Inject] 跳过重复消息:', comment.content);
                }
            });

            // 只有有新消息时才发送
            if (newComments.length > 0) {
                console.log('[Inject] 发送新消息，数量:', newComments.length);
                const newData = {
                    ...data,
                    data: {
                        ...data.data,
                        comments: newComments
                    }
                };
                
                window.postMessage({
                    type: 'JSONP_RESPONSE',
                    data: newData
                }, '*');
            }

            // 清理过期消息ID
            cleanupProcessedMessages();
        } catch (e) {
            console.error('[Inject] 处理JSONP响应时出错:', e);
        } finally {
            window.__TAOBAO_LIVE_HELPER__.isProcessing = false;
        }
    };

    // 监听URL变化
    let lastUrl = null;
    function checkUrlChange() {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            window.postMessage({
                type: 'CAPTURED_URL',
                url: currentUrl
            }, '*');
        }
    }

    // 创建MutationObserver来监听script标签的添加
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeName === 'SCRIPT') {
                    const src = node.src || '';
                    if (src.includes('mtop.taobao.iliad.comment.query.latest')) {
                        // 检查是否包含callback参数
                        const url = new URL(src);
                        const callback = url.searchParams.get('callback');
                        if (callback) {
                            // 替换原始callback
                            const newSrc = src.replace(callback, '__processJSONPResponse');
                            
                            // 创建新的script标签
                            const newScript = document.createElement('script');
                            newScript.src = newSrc;
                            
                            // 替换原始script标签
                            node.parentNode.replaceChild(newScript, node);
                        }
                    }
                }
            });
        });
    });

    // 开始监听DOM变化
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    // 定期检查URL变化
    setInterval(checkUrlChange, 1000);

    // 初始检查URL
    checkUrlChange();

    console.log('注入脚本加载完成');
}
