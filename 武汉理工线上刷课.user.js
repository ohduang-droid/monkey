// ==UserScript==
// @name         自动答题脚本（低日志版2）
// @namespace    https://tampermonkey.net/
// @version      1.0.2
// @description  自动处理摄像头确认弹框、视频播放与确认逻辑（减少控制台日志）
// @match *://jypxzx.whut.edu.cn/*
// @match *://att.whxunw.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const DEBUG = false; // 想看详细日志就改成 true
  const TAG = '[AUTO]';

  function log(...args) { console.log(TAG, ...args); }
  function debug(...args) { if (DEBUG) console.log(TAG, ...args); }
  function warn(...args) { console.warn(TAG, ...args); }

  // ===== 工具：等待元素出现 =====
  function waitForElement(getter, { interval = 300, timeout = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const t = setInterval(() => {
        let el = null;
        try { el = getter(); } catch (e) {}
        if (el) { clearInterval(t); resolve(el); return; }
        if (Date.now() - start > timeout) { clearInterval(t); reject(new Error('timeout')); }
      }, interval);
    });
  }

  log('脚本已加载');

  // ====== 1) 视频结束自动播放下一个（只绑定一次） ======
  const VIDEO_ID = 'valveVideogj_html5_api';
  let videoBound = false;

  async function bindVideoEvent() {
    if (videoBound) return;

    try {
      const video = await waitForElement(() => document.getElementById(VIDEO_ID));
      if (videoBound) return;

      video.addEventListener('ended', () => {
        log('视频结束，查找下一个…');

        const pointers = [...document.querySelectorAll('.pointer')];
        for (let i = 0; i < pointers.length; i++) {
          if (pointers[i].classList.contains('play')) {
            const next = pointers[i + 1];
            if (next) {
              next.click();
              const name = next.querySelector('span')?.innerHTML?.trim() || '';
              log(`已切到下一个：${name}`);
            } else {
              log('已是最后一个视频');
            }
            break;
          }
        }
      });

      videoBound = true;
      log('视频事件绑定完成');
    } catch (e) {
      debug('未找到视频元素，跳过视频绑定');
    }
  }
  bindVideoEvent();

  // ====== 2) 确认按钮处理（减少日志 + 防重复处理同一个弹框） ======
  function findConfirmButtons() {
    return [...document.querySelectorAll('button.el-button')]
      .filter(btn => btn.innerText.trim() === '确定');
  }

  function isInMessageBox(btn) {
    return !!btn.closest('.el-message-box');
  }

  function getMessageBoxText() {
    const box = document.querySelector('.el-message-box');
    return box ? box.innerText.replace(/\s+/g, ' ').trim() : '';
  }

  let refreshTriggered = false;
  let lastBoxText = '';         // 防止同一个弹框重复点击
  let lastBoxActionAt = 0;      // 防抖

  const timer = setInterval(() => {
    const confirms = findConfirmButtons();
    if (!confirms.length) return;

    // 优先处理 message-box 的确定
    const msgBtn = confirms.find(isInMessageBox);
    if (msgBtn) {
      const text = getMessageBoxText();

      // 防重复：同一个弹框短时间内只处理一次
      const now = Date.now();
      if (text && text === lastBoxText && (now - lastBoxActionAt) < 1500) {
        debug('同一弹框重复出现，跳过');
        return;
      }
      lastBoxText = text;
      lastBoxActionAt = now;

      if (text.includes('摄像头') || text.includes('是否继续')) {
        log('摄像头弹框：点击确定（不刷新）');
        msgBtn.click();
        return;
      }

      log('普通弹框：点击确定并刷新');
      if (!refreshTriggered) {
        refreshTriggered = true;
        clearInterval(timer);
        msgBtn.click();
        setTimeout(() => window.location.reload(), 500);
      }
      return;
    }

    // 普通页面的确定按钮
    if (!refreshTriggered) {
      log('普通页面“确定”：点击并刷新');
      refreshTriggered = true;
      clearInterval(timer);
      confirms[0].click();
      setTimeout(() => window.location.reload(), 500);
    }
  }, 1000);

(() => {
  const DEBUG = true;
  const log = (...a) => DEBUG && console.info("[quiz-test]", ...a);

  let lastState = "";

  function getDialogRoot() {
    // 你页面真实根就是 .dilog（拼写就是这样）
    return document.querySelector("div.dilog");
  }

  function getBottomBtn(root) {
    if (!root) return null;
    const btns = [...root.querySelectorAll(".bottoms button.el-button")];
    const textOf = (b) => (b.querySelector("span")?.textContent || b.textContent || "").replace(/\s+/g, "").trim();

    // 结果态可能是“关闭”，做题态是“确定”
    return btns.find(b => textOf(b).includes("关闭")) ||
           btns.find(b => textOf(b).includes("确定")) ||
           null;
  }

  const timer = setInterval(() => {
    const root = getDialogRoot();
    const state = root ? "found_root" : "missing_root";

    if (state !== lastState) {
      lastState = state;
      log(state === "found_root" ? "找到 dilog 容器" : "未找到 dilog 容器");
    }

    if (!root) return;

    const btn = getBottomBtn(root);
    if (!btn) {
      log("已找到 dilog，但未找到 bottoms 按钮");
      return;
    }

    const text = (btn.querySelector("span")?.textContent || btn.textContent || "").trim();
    log("点击按钮：", text);

    // 更稳：滚到可视区域再点
    btn.scrollIntoView({ block: "center", inline: "center" });
    btn.click();

    clearInterval(timer);
    log("已完成并停止轮询");
  }, 300); // 300ms 足够，不要太小
})();
})();
