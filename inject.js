// 检查是否已经注入
if (window.hasOwnProperty('__TAOBAO_LIVE_HELPER_INJECT_LOADED__')) {
    console.log('注入脚本已加载，跳过');
} else {
    // 标记为已注入
    window.__TAOBAO_LIVE_HELPER_INJECT_LOADED__ = true;

    // 等待页面加载完成后再初始化
    function initializeHelper() {
        console.log('[Inject] 页面加载完成，开始初始化');

        // 初始化全局对象
        window.__TAOBAO_LIVE_HELPER__ = {
            lastProcessedData: null,
            processedMessages: new Set(),
            maxProcessedMessages: 1000,
            isProcessing: false
        };

        // 处理JSONP响应
        window.__processJSONPResponse = function(data) {
            try {
                // 检查基本数据结构
                if (!data || !data.data) {
                    console.log('[Inject] 无效的数据格式 - 缺少data字段');
                    return;
                }

                // 从返回数据中提取评论
                let comments = [];
                if (data.data.commentList) {
                    comments = data.data.commentList;
                } else if (data.data.comments) {
                    comments = data.data.comments;
                } else if (data.data.result && data.data.result.commentList) {
                    comments = data.data.result.commentList;
                } else if (Array.isArray(data.data)) {
                    comments = data.data;
                }

                if (!comments || comments.length === 0) {
                    return;
                }

                // 处理评论数据
                comments = comments.map(comment => {
                    // 获取用户token
                    let userToken = '';
                    if (comment.renders && comment.renders.userToken) {
                        userToken = comment.renders.userToken;
                    } else if (comment.userToken) {
                        userToken = comment.userToken;
                    } else if (comment.userId) {
                        userToken = comment.userId;
                    } else if (comment.publisherId) {
                        userToken = comment.publisherId;
                    }

                    // 获取直播间ID
                    let liveId = '';
                    if (comment.renders && comment.renders.liveId) {
                        liveId = comment.renders.liveId;
                    }

                    return {
                        content: comment.content || comment.message || '',
                        nick: comment.userNick || comment.tbNick || comment.publisherNick || '',
                        userId: userToken,
                        time: comment.timestamp || comment.gmtCreate || Date.now(),
                        liveId: liveId
                    };
                }).filter(comment => comment.content && comment.content.trim());

                // 发送评论数据到content script
                if (comments.length > 0) {
                    window.postMessage({
                        type: 'newComments',
                        data: comments
                    }, '*');
                }
            } catch (error) {
                console.error('[Inject] 处理数据时出错:', error);
            }
        };

        // 创建代理回调函数
        window.__createCallbackProxy = function(callbackName) {
            const originalCallback = window[callbackName];
            window[callbackName] = function(data) {
                console.log('[Inject] JSONP回调被调用:', callbackName);
                if (originalCallback) {
                    originalCallback(data);
                }
                window.__processJSONPResponse(data);
            };
        };

        // 监听script标签的创建
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.tagName === 'SCRIPT') {
                        const src = node.src;
                        if (src && src.includes('mtop.taobao.iliad.comment.query.latest')) {
                            console.log('[Inject] 发现新的JSONP请求:', src);
                            
                            // 提取callback参数
                            const match = src.match(/callback=(mtopjsonp\d+)/);
                            if (match) {
                                const callbackName = match[1];
                                console.log('[Inject] 找到callback:', callbackName);
                                
                                // 创建代理
                                const injectScript = document.createElement('script');
                                injectScript.textContent = `window.__createCallbackProxy('${callbackName}');`;
                                document.head.appendChild(injectScript);
                                injectScript.remove();
                            }
                        }
                    }
                });
            });
        });

        // 观察document的变化
        observer.observe(document, {
            childList: true,
            subtree: true
        });

        // 监听URL变化
        const originalCreateElement = document.createElement;
        document.createElement = function(tagName) {
            const element = originalCreateElement.call(document, tagName);
            if (tagName.toLowerCase() === 'script') {
                const originalSetAttribute = element.setAttribute;
                element.setAttribute = function(name, value) {
                    if (name === 'src' && value.includes('mtop.taobao.iliad.comment.query.latest')) {
                        console.log('[Inject] 捕获到JSONP URL:', value);
                    }
                    return originalSetAttribute.call(this, name, value);
                };
            }
            return element;
        };

        console.log('[Inject] 注入脚本初始化完成');
    }

    // 在页面加载完成后再初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initializeHelper, 1000); // 延迟1秒初始化
        });
    } else {
        setTimeout(initializeHelper, 1000); // 延迟1秒初始化
    }
}
