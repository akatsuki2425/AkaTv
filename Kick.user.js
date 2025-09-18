// ==UserScript==
// @name         FUTBIN Price Analyzer Pro (v3.0)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  تحليل أسعار FUTBIN مع RSI, MACD, Bollinger, إشعارات، وقائمة مراقبة
// @author       YourName
// @match        https://www.futbin.com/*
// @grant        none
// @license      MIT
// @icon         https://www.futbin.com/favicon.ico
// @downloadURL  https://raw.githubusercontent.com/akatsuki2425/AkaTv/refs/heads/master/futbin-analyzer.user.js
// @updateURL    https://raw.githubusercontent.com/akatsuki2425/AkaTv/refs/heads/master/futbin-analyzer.user.js
// ==/UserScript==

(function () {
    'use strict';

    /************* إعدادات *************/
    const CHECK_INTERVAL_MS = 60 * 1000; // تحديث كل دقيقة
    const RSI_PERIOD = 14;
    const BB_PERIOD = 20;
    const BB_STD = 2;
    const MACD_FAST = 12;
    const MACD_SLOW = 26;
    const MACD_SIGNAL = 9;
    const STORAGE_KEY = 'futbin_price_analyzer_watchlist_v3';

    /************* دوال مساعدة للحساب *************/
    function sma(values, period) {
        if (values.length < period) return null;
        let sum = 0;
        for (let i = values.length - period; i < values.length; i++) sum += values[i];
        return sum / period;
    }

    function stddev(values, period) {
        if (values.length < period) return null;
        const slice = values.slice(values.length - period);
        const mean = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
        return Math.sqrt(variance);
    }

    function ema(values, period) {
        if (values.length < period) return null;
        const k = 2 / (period + 1);
        // start with SMA for first EMA
        let emaPrev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
        for (let i = period; i < values.length; i++) {
            emaPrev = values[i] * k + emaPrev * (1 - k);
        }
        return emaPrev;
    }

    function calcRSI(values, period = RSI_PERIOD) {
        if (values.length <= period) return "N/A";
        let gains = 0, losses = 0;
        for (let i = values.length - period; i < values.length; i++) {
            const diff = values[i] - values[i - 1];
            if (diff > 0) gains += diff;
            else losses += Math.abs(diff);
        }
        const avgGain = gains / period;
        const avgLoss = losses / period || 1e-9;
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        return parseFloat(rsi.toFixed(2));
    }

    function calcMACD(values, fast = MACD_FAST, slow = MACD_SLOW, signal = MACD_SIGNAL) {
        if (values.length < slow) return { macd: "N/A", signal: "N/A", hist: "N/A" };
        // compute EMA series quickly: iterative
        function emaSeries(vals, period) {
            const k = 2 / (period + 1);
            let res = [];
            // first EMA is SMA of first period
            let emaPrev = vals.slice(0, period).reduce((a, b) => a + b, 0) / period;
            res[period - 1] = emaPrev;
            for (let i = period; i < vals.length; i++) {
                emaPrev = vals[i] * k + emaPrev * (1 - k);
                res[i] = emaPrev;
            }
            return res;
        }
        const emaFast = emaSeries(values, fast);
        const emaSlow = emaSeries(values, slow);
        // MACD line is difference where both defined
        const macdLine = [];
        for (let i = 0; i < values.length; i++) {
            if (emaFast[i] !== undefined && emaSlow[i] !== undefined) macdLine[i] = emaFast[i] - emaSlow[i];
        }
        // compute signal line as EMA of macdLine (exclude undefined)
        const macdDefined = macdLine.filter(v => v !== undefined);
        if (macdDefined.length < signal) return { macd: "N/A", signal: "N/A", hist: "N/A" };
        // compute last MACD and last signal
        // build full signal EMA over macdDefined
        const signalVal = ema(macdDefined, signal);
        const macdVal = macdDefined[macdDefined.length - 1];
        const hist = macdVal - signalVal;
        return { macd: parseFloat(macdVal.toFixed(4)), signal: parseFloat(signalVal.toFixed(4)), hist: parseFloat(hist.toFixed(4)) };
    }

    function calcBollinger(values, period = BB_PERIOD, stdMul = BB_STD) {
        if (values.length < period) return { middle: "N/A", upper: "N/A", lower: "N/A" };
        const middle = sma(values, period);
        const sd = stddev(values, period);
        const upper = middle + stdMul * sd;
        const lower = middle - stdMul * sd;
        return { middle: parseFloat(middle.toFixed(2)), upper: parseFloat(upper.toFixed(2)), lower: parseFloat(lower.toFixed(2)) };
    }

    /************* تحليل الأسعار (مطوّر) *************/
    function analyzePricesFromData(data) {
        // data: array of [timestamp, price] أو بيانات مشابهة
        const prices = data.map(d => d[1]).filter(p => p > 0);
        if (!prices.length) return null;
        const latest = prices[prices.length - 1];
        const highest = Math.max(...prices);
        const lowest = Math.min(...prices);
        const average = parseFloat((prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2));
        const deviation = parseFloat((((latest - average) / average) * 100).toFixed(2));
        const rsi = calcRSI(prices, RSI_PERIOD);
        const macd = calcMACD(prices, MACD_FAST, MACD_SLOW, MACD_SIGNAL);
        const bb = calcBollinger(prices, BB_PERIOD, BB_STD);
        // اتجاه بسيط (استخدم آخر 5 نقاط)
        const recent = prices.slice(-5);
        let trendScore = 0;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i] > recent[i - 1]) trendScore++;
            else if (recent[i] < recent[i - 1]) trendScore--;
        }
        const trend = trendScore >= 3 ? "🔼 صاعد" : (trendScore <= -3 ? "🔽 هابط" : "🔁 جانبي");

        // توصية + درجة ثقة (توافق RSI + MACD + موقع السعر ضمن Bollinger)
        let advice = "⚪ لا توجد توصية";
        let confidence = 0;
        if (rsi !== "N/A") {
            if (rsi < 30) { advice = "🟢 شراء (Oversold)"; confidence += 40; }
            else if (rsi > 70) { advice = "🔴 بيع (Overbought)"; confidence += 40; }
        }
        if (macd.macd !== "N/A") {
            if (macd.hist > 0) { confidence += 30; if (advice === "⚪ لا توجد توصية") advice = "🟢 ميل للشراء (MACD إيجابي)"; }
            else { confidence += 10; if (advice === "⚪ لا توجد توصية") advice = "🔴 ميل للبيع (MACD سلبي)"; }
        }
        // موقع السعر بالنسبة للباند
        if (bb.middle !== "N/A") {
            if (latest < bb.lower) { advice = "🟢 شراء (أسفل Bollinger)"; confidence += 30; }
            else if (latest > bb.upper) { advice = "🔴 بيع (فوق Bollinger)"; confidence += 30; }
            else { confidence += 10; }
        }

        // cap confidence
        confidence = Math.min(100, confidence);

        return {
            latest, highest, lowest, average, deviation, rsi, macd, bb, trend, advice, confidence, prices
        };
    }

    /************* واجهة المستخدم وإدراج الصندوق *************/
    function createOrUpdateBox(result, platform = 'PS', itemId = null) {
        const target = document.querySelector('.highcharts-graph-wrapper');
        if (!target) return;

        let existing = document.getElementById('price-analyzer-box-pro');
        if (existing) existing.remove();

        const box = document.createElement('div');
        box.id = 'price-analyzer-box-pro';
        box.style.marginTop = '16px';
        box.style.padding = '12px';
        box.style.border = '2px solid';
        box.style.borderRadius = '8px';
        box.style.backgroundColor = '#f7fbff';
        box.style.fontSize = '13px';
        box.style.color = '#111';
        box.style.lineHeight = '1.5';
        box.style.maxWidth = '520px';

        // border color by confidence
        if (result.confidence >= 70) box.style.borderColor = '#28a745';
        else if (result.confidence >= 40) box.style.borderColor = '#ffc107';
        else box.style.borderColor = '#007bff';

        // build mini chart canvas id unique
        const canvasId = 'pa-mini-chart';

        box.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <h3 style="margin:0 0 6px 0">📊 تحليل أسعار (${platform})</h3>
                    <div style="font-size:12px; color:#333">
                        <div>🔸 <strong>آخر سعر:</strong> ${result.latest}</div>
                        <div>🔺 <strong>أعلى:</strong> ${result.highest} &nbsp; 🔻 <strong>أدنى:</strong> ${result.lowest}</div>
                        <div>📈 <strong>متوسط:</strong> ${result.average} &nbsp; ⚖️ <strong>انحراف:</strong> ${result.deviation}%</div>
                        <div>🧮 <strong>RSI(${RSI_PERIOD}):</strong> ${result.rsi}</div>
                        <div>📉 <strong>MACD:</strong> ${result.macd.macd} &nbsp; <strong>Signal:</strong> ${result.macd.signal} &nbsp; <strong>Hist:</strong> ${result.macd.hist}</div>
                        <div>📦 <strong>Bollinger:</strong> mid ${result.bb.middle} | up ${result.bb.upper} | low ${result.bb.lower}</div>
                        <div>📊 <strong>اتجاه السوق:</strong> ${result.trend}</div>
                        <div>📌 <strong>التوصية:</strong> ${result.advice} &nbsp; <strong>ثقة:</strong> ${result.confidence}%</div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <button id="pa-add-watch" style="margin-bottom:6px;">➕ أضف للمراقبة</button><br/>
                    <button id="pa-open-watch" style="margin-bottom:6px;">📂 عرض القائمة</button><br/>
                    <small style="font-size:11px;color:#666">تحديث كل ${CHECK_INTERVAL_MS/1000}s</small>
                </div>
            </div>
            <div style="margin-top:10px;">
                <canvas id="${canvasId}" width="480" height="120" style="width:100%; height:80px; border-radius:4px; background:#fff"></canvas>
            </div>
        `;

        target.parentElement.appendChild(box);

        // attach watch buttons
        document.getElementById('pa-add-watch').addEventListener('click', () => {
            addToWatchlist({ id: itemId || generateItemIdFromPage(), platform });
            alert('✅ تمت الإضافة إلى قائمة المراقبة');
        });
        document.getElementById('pa-open-watch').addEventListener('click', () => {
            openWatchlistModal();
        });

        // رسم المخطط المصغر (باستخدام canvas وبدون مكتبات)
        try { drawMiniChart(canvasId, result.prices, result.bb); } catch (e) { console.warn(e); }
    }

    function drawMiniChart(canvasId, prices, bb = null) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !prices || !prices.length) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        // margins
        const m = { l: 30, r: 6, t: 6, b: 18 };
        const pw = w - m.l - m.r;
        const ph = h - m.t - m.b;
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = max - min || 1;
        // draw line
        ctx.beginPath();
        for (let i = 0; i < prices.length; i++) {
            const x = m.l + (i / (prices.length - 1)) * pw;
            const y = m.t + ph - ((prices[i] - min) / range) * ph;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#007bff';
        ctx.stroke();
        // draw bollinger bands if available
        if (bb && bb.middle !== "N/A") {
            // draw middle (as dashed)
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            // horizontal lines
            const toY = val => m.t + ph - ((val - min) / range) * ph;
            ctx.moveTo(m.l, toY(bb.middle));
            ctx.lineTo(m.l + pw, toY(bb.middle));
            ctx.strokeStyle = '#6c757d';
            ctx.stroke();
            // upper
            ctx.beginPath();
            ctx.moveTo(m.l, toY(bb.upper));
            ctx.lineTo(m.l + pw, toY(bb.upper));
            ctx.strokeStyle = '#28a745';
            ctx.stroke();
            // lower
            ctx.beginPath();
            ctx.moveTo(m.l, toY(bb.lower));
            ctx.lineTo(m.l + pw, toY(bb.lower));
            ctx.strokeStyle = '#dc3545';
            ctx.stroke();
            ctx.setLineDash([]);
        }
        // draw axes labels (min & max)
        ctx.fillStyle = '#333';
        ctx.font = '10px Arial';
        ctx.fillText(max.toFixed(0), 2, m.t + 10);
        ctx.fillText(min.toFixed(0), 2, h - 4);
    }

    /************* Watchlist (localStorage) *************/
    function loadWatchlist() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.warn('failed to load watchlist', e);
            return [];
        }
    }
    function saveWatchlist(list) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
    function addToWatchlist(item) {
        const list = loadWatchlist();
        // avoid duplicates by id+platform
        if (!list.find(x => x.id === item.id && x.platform === item.platform)) {
            list.push({ ...item, addedAt: Date.now() });
            saveWatchlist(list);
        }
    }
    function removeFromWatchlist(id, platform) {
        let list = loadWatchlist().filter(x => !(x.id === id && x.platform === platform));
        saveWatchlist(list);
    }
    function openWatchlistModal() {
        const list = loadWatchlist();
        let html = '<div style="padding:12px;font-size:13px;">';
        if (!list.length) html += '<div>قائمة المراقبة فارغة</div>';
        else {
            html += '<table style="width:100%;font-size:13px;">';
            html += '<tr><th>الـID</th><th>المنصة</th><th>أضيفت</th><th>إجراءات</th></tr>';
            for (const it of list) {
                html += `<tr><td>${it.id}</td><td>${it.platform}</td><td>${new Date(it.addedAt).toLocaleString()}</td><td><button class="pa-rem" data-id="${it.id}" data-platform="${it.platform}">حذف</button></td></tr>`;
            }
            html += '</table>';
        }
        html += '</div>';
        // simple modal
        const modal = document.createElement('div');
        modal.id = 'pa-watch-modal';
        modal.style.position = 'fixed';
        modal.style.left = '50%';
        modal.style.top = '50%';
        modal.style.transform = 'translate(-50%,-50%)';
        modal.style.background = '#fff';
        modal.style.border = '1px solid #ccc';
        modal.style.zIndex = 99999;
        modal.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)';
        modal.style.borderRadius = '6px';
        modal.innerHTML = `<div style="padding:8px 12px;"><button id="pa-watch-close" style="float:right">✖</button><h4 style="margin:0 0 8px 0">قائمة المراقبة</h4>${html}</div>`;
        document.body.appendChild(modal);
        document.getElementById('pa-watch-close').addEventListener('click', () => modal.remove());
        modal.querySelectorAll('.pa-rem').forEach(btn => {
            btn.addEventListener('click', (e) => {
                removeFromWatchlist(btn.dataset.id, btn.dataset.platform);
                modal.remove();
                openWatchlistModal();
            });
        });
    }

    /************* تنبيهات المتصفح *************/
    function ensureNotificationPermission() {
        if (!("Notification" in window)) return;
        if (Notification.permission === 'default') Notification.requestPermission();
    }
    function sendNotification(title, body) {
        if (!("Notification" in window)) return;
        if (Notification.permission !== 'granted') return;
        new Notification(title, { body });
    }

    /************* مساعد: استخراج بيانات من الصفحة *************/
    // هذه الدالة تحاول جلب بيانات الرسوم من مكان متوقع: data-ps-data / data-xbox-data / data-pc-data
    function extractPlatformData() {
        const res = {};
        const graph = document.querySelector('.highcharts-graph-wrapper');
        if (!graph) return null;
        // محاولات قراءة بيانات مهيكلة في attributes
        const possible = [
            { key: 'PS', attr: 'data-ps-data' },
            { key: 'Xbox', attr: 'data-xbox-data' },
            { key: 'PC', attr: 'data-pc-data' }
        ];
        for (const p of possible) {
            const attr = graph.getAttribute(p.attr);
            if (attr) {
                try {
                    res[p.key] = JSON.parse(attr);
                } catch (e) {
                    // ربما الـ attr يحتوي JSON مغلف; حاول استخراج الأرقام
                    try {
                        res[p.key] = JSON.parse(attr.replace(/&quot;/g, '"'));
                    } catch (ee) { /* skip */ }
                }
            }
        }
        // إذا لم نجد، حاول أن نقرأ attribute عام واحد
        if (!Object.keys(res).length) {
            // محاولة: قد يكون هناك data-graph attribute بحقول
            ['data-graph', 'data-chart'].forEach(a => {
                const v = graph.getAttribute(a);
                if (v) {
                    try {
                        const parsed = JSON.parse(v);
                        // حاول إيجاد series أولية
                        if (parsed.series && parsed.series[0] && parsed.series[0].data) {
                            res['PS'] = parsed.series[0].data; // fallback
                        }
                    } catch (_) {}
                }
            });
        }
        return Object.keys(res).length ? res : null;
    }

    function generateItemIdFromPage() {
        // حاول استخراج اسم اللاعب أو id من عنوان الصفحة أو URL
        const url = location.href;
        // futbin عادة: /player/12345/Name
        const match = url.match(/\/player\/(\d+)/);
        if (match) return match[1];
        const title = document.querySelector('h1') ? document.querySelector('h1').innerText.trim() : url;
        return title;
    }

    /************* دالة رئيسية للتشغيل والتحقق ****************/
    function analyzeAndInsert() {
        const allData = extractPlatformData();
        if (!allData) return;
        // loop over platforms present and show box for first found (يمكن تعديل ليعرض لكل منصة)
        for (const platform of Object.keys(allData)) {
            const pdata = allData[platform];
            const result = analyzePricesFromData(pdata);
            if (!result) continue;
            const itemId = generateItemIdFromPage();
            createOrUpdateBox(result, platform, itemId);
            // تنبيهات ذكية: إذا كانت ثقة عالية (>70) و توصية شراء/بيع واضحة - أرسل Notification
            if (result.confidence >= 70) {
                sendNotification(`FUTBIN Analyzer: ${result.advice}`, `عن ${platform} — سعر ${result.latest} — ثقة ${result.confidence}%`);
            }
            // فقط اعرض أول منصة متاحة (تغيير سلوكي سهل)
            break;
        }
    }

    /************* روتين تحقق دوري لقائمة المراقبة *************/
    function periodicWatchlistCheck() {
        const list = loadWatchlist();
        if (!list.length) return;
        const allData = extractPlatformData();
        if (!allData) return;
        for (const it of list) {
            const pdata = allData[it.platform];
            if (!pdata) continue;
            const result = analyzePricesFromData(pdata);
            if (!result) continue;
            // شرط تنبيه بسيط: لو انحراف السعر الحالي أكبر من 6% عن المتوسط (قابل للتعديل)
            if (Math.abs(result.deviation) >= 6) {
                sendNotification(`سعر ${it.id} (${it.platform}) تغير ±${result.deviation}%`, `سعر الآن ${result.latest} — توصية: ${result.advice}`);
            }
        }
    }

    /************* تشغيل عند التحميل *************/
    window.addEventListener('load', () => {
        ensureNotificationPermission();
        analyzeAndInsert();
        setInterval(analyzeAndInsert, CHECK_INTERVAL_MS);
        setInterval(periodicWatchlistCheck, CHECK_INTERVAL_MS * 2); // تحقق أبطأ لقائمة المراقبة
    });

    /************* اختياري: استجابة لتغيّر محتوى الصفحة الديناميكي *************/
    // بعض صفحات FUTBIN تحمل البيانات بعد التحميل؛ رصد تغيّر DOM
    const observer = new MutationObserver((mutations) => {
        // لو ظهرت highcharts-graph-wrapper جديد
        if (document.querySelector('.highcharts-graph-wrapper')) analyzeAndInsert();
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();
