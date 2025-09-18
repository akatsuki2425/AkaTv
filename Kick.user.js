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
// @downloadURL  https://raw.githubusercontent.com/akatsuki2425/AkaTv/refs/heads/master/Kick.user.js
// @updateURL    https://raw.githubusercontent.com/akatsuki2425/AkaTv/refs/heads/master/Kick.user.js
// ==/UserScript==

(function () {
    'use strict';

    // --- التحليل المتقدم ---

    function calculateRSI(data, period = 14) {
        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            const diff = data[i][1] - data[i - 1][1];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }
        const avgGain = gains / period;
        const avgLoss = losses / period || 1;
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        return rsi.toFixed(2);
    }

    function calculateMACD(prices, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
        function EMA(list, period) {
            const k = 2 / (period + 1);
            let ema = list.slice(0, period).reduce((a, b) => a + b) / period;
            for (let i = period; i < list.length; i++) {
                ema = list[i] * k + ema * (1 - k);
            }
            return ema;
        }
        const macdLine = EMA(prices, shortPeriod) - EMA(prices, longPeriod);
        // حساب خط الإشارة بشكل تقريبي
        const signalLine = EMA(Array(prices.length).fill(macdLine), signalPeriod);
        return {macdLine: macdLine.toFixed(2), signalLine: signalLine.toFixed(2)};
    }

    function calculateBollingerBands(prices, period = 20) {
        if(prices.length < period) return {upper: "N/A", lower: "N/A"};
        const slice = prices.slice(-period);
        const avg = slice.reduce((a, b) => a + b, 0) / period;
        const stdDev = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / period);
        return {
            upper: (avg + 2 * stdDev).toFixed(2),
            lower: (avg - 2 * stdDev).toFixed(2)
        };
    }

    // --- تخزين وإعدادات المستخدم ---

    function savePriceHistory(playerId, prices) {
        GM_setValue(`priceHistory_${playerId}`, JSON.stringify(prices));
    }
    function loadPriceHistory(playerId) {
        const val = GM_getValue(`priceHistory_${playerId}`, "[]");
        return JSON.parse(val);
    }

    // --- الإشعارات الذكية ---
    function notifyUser(title, text, icon) {
        GM_notification({
            title: title,
            text: text,
            image: icon || "https://www.futbin.com/favicon.ico",
            timeout: 6000
        });
    }

    // --- تحليل الأسعار الأساسي + إضافات ---
    function analyzePrices(data, playerId) {
        const prices = data.map(d => d[1]).filter(p => p > 0);
        savePriceHistory(playerId, prices);

        const latest = prices[prices.length - 1];
        const highest = Math.max(...prices);
        const lowest = Math.min(...prices);
        const average = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2);
        const deviation = ((latest - average) / average * 100).toFixed(2);
        const rsi = prices.length >= 15 ? calculateRSI(data.slice(-15)) : "N/A";
        const macdObj = prices.length >= 26 ? calculateMACD(prices) : {macdLine: "N/A", signalLine: "N/A"};
        const bollinger = prices.length >= 20 ? calculateBollingerBands(prices) : {upper: "N/A", lower: "N/A"};

        // إشعارات ذكية
        if(rsi !== "N/A" && (parseFloat(rsi)<30 || parseFloat(rsi)>70)){
            notifyUser("توصية سعر", rsi<30 ? "فرصة شراء محتملة" : "فرصة بيع محتملة");
        }
        if(latest >= bollinger.upper && bollinger.upper!=="N/A") {
            notifyUser("تنبيه بولينجر", "السعر أعلى من النطاق المعتاد!");
        }
        if(latest <= bollinger.lower && bollinger.lower!=="N/A") {
            notifyUser("تنبيه بولينجر", "السعر أقل من النطاق المعتاد!");
        }

        // التوصية
        let advice = "⚪ لا توجد توصية";
        if (rsi !== "N/A") {
            const rsiVal = parseFloat(rsi);
            if (rsiVal < 30) advice = "🟢 فرصة شراء (Oversold)";
            else if (rsiVal > 70) advice = "🔴 فرصة بيع (Overbought)";
        }

        return { latest, highest, lowest, average, deviation, rsi, advice, macd: macdObj, bollinger };
    }

    // --- واجهة مستخدم تفاعلية + تصدير CSV ---
    function insertResultBox(result, playerId) {
        const target = document.querySelector('.highcharts-graph-wrapper');
        if (!target) return;

        const existing = document.getElementById('price-analyzer-box');
        if (existing) existing.remove();

        const box = document.createElement('div');
        box.id = 'price-analyzer-box';
        box.style.marginTop = '20px';
        box.style.padding = '15px';
        box.style.borderRadius = '8px';
        box.style.backgroundColor = '#f1f9ff';
        box.style.color = '#000';
        box.style.fontSize = '14px';
        box.style.lineHeight = '1.6';
        box.style.border = '2px solid #007bff';

        box.innerHTML = `
            <h3 style="margin-bottom: 10px;">📊 تحليل أسعار PS</h3>
            <ul style="list-style: none; padding: 0;">
                <li>🔸 <strong>آخر سعر:</strong> ${result.latest}</li>
                <li>🔺 <strong>أعلى سعر:</strong> ${result.highest}</li>
                <li>🔻 <strong>أدنى سعر:</strong> ${result.lowest}</li>
                <li>📈 <strong>متوسط السعر:</strong> ${result.average}</li>
                <li>⚖️ <strong>الانحراف عن المتوسط:</strong> ${result.deviation}%</li>
                <li>🧮 <strong>RSI (14):</strong> ${result.rsi}</li>
                <li>📌 <strong>التوصية:</strong> ${result.advice}</li>
                <li>📊 <strong>MACD:</strong> ${result.macd.macdLine} | Signal: ${result.macd.signalLine}</li>
                <li>📏 <strong>Bollinger (أعلى/أدنى):</strong> ${result.bollinger.upper} / ${result.bollinger.lower}</li>
            </ul>
            <button id="export-btn">تصدير البيانات (CSV)</button>
        `;
        target.parentElement.appendChild(box);

        document.getElementById('export-btn').onclick = function() {
            const priceHistory = loadPriceHistory(playerId);
            let csv = "Index,Price\n";
            priceHistory.forEach((p, i) => { csv += `${i+1},${p}\n`; });
            const blob = new Blob([csv], {type: 'text/csv'});
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'futbin_price_history.csv';
            link.click();
        };
    }

    // --- مراقبة الأخطاء وتحديث البيانات تلقائياً ---
    function analyzeAndInsert() {
        const graphDiv = document.querySelector('.highcharts-graph-wrapper');
        if (!graphDiv) return;
        try {
            const psData = JSON.parse(graphDiv.getAttribute('data-ps-data'));
            const playerId = window.location.pathname.split('/')[2] || "unknown";
            const result = analyzePrices(psData, playerId);
            insertResultBox(result, playerId);
        } catch (e) {
            notifyUser("خطأ تحليل البيانات", "فشل في تحليل بيانات سعر اللاعب");
            console.warn("❌ فشل في تحليل البيانات:", e);
        }
    }

    window.addEventListener('load', () => {
        analyzeAndInsert();
        setInterval(analyzeAndInsert, 60000);
    });
})();
