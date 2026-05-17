(function () {
  "use strict";

  /**
   * Amazonのレビュー星分布を取得する。
   * 複数のセレクタ戦略を順に試みる。
   * @returns {{ ratings: number[], percents: number[] } | null}
   */
  function fetchRatingDistribution() {
    // --- 戦略1: aria-valuenow を持つプログレスバーから取得 ---
    // Amazon は <div class="a-meter" role="progressbar" aria-valuenow="65"> を使う
    const meters = document.querySelectorAll(
      '[role="progressbar"][aria-valuenow]'
    );
    if (meters.length >= 3) {
      const result = parseMeterElements(meters);
      if (result) {
        console.log("[hensa] strategy1 (progressbar):", result);
        return result;
      }
    }

    // --- 戦略2: #histogramTable の行から取得 ---
    const histRows = document.querySelectorAll("#histogramTable tr");
    if (histRows.length > 0) {
      const result = parseTableRows(histRows);
      if (result) {
        console.log("[hensa] strategy2 (histogramTable):", result);
        return result;
      }
    }

    // --- 戦略3: .a-histogram-row クラスから取得 ---
    const histRowAlt = document.querySelectorAll(
      ".a-histogram-row, [data-hook='histogram-row']"
    );
    if (histRowAlt.length > 0) {
      const result = parseTableRows(histRowAlt);
      if (result) {
        console.log("[hensa] strategy3 (histogram-row):", result);
        return result;
      }
    }

    // --- デバッグ: 見つからない場合にDOMダンプ ---
    console.warn("[hensa] レビューヒストグラムが見つかりません。");
    console.log("[hensa] #histogramTable:", document.querySelector("#histogramTable"));
    console.log("[hensa] progressbars:", meters);
    console.log(
      "[hensa] page title:",
      document.title
    );

    return null;
  }

  /**
   * role=progressbar 要素から各星の割合を読み取る。
   * Amazonのヒストグラムは常に5★→1★の順で並んでいるため、
   * 出現順に5,4,3,2,1を割り当てる。
   */
  function parseMeterElements(meters) {
    // ページ上のすべてのprogressbarから有効な値(0-100)を収集
    const pcts = [];
    meters.forEach((meter) => {
      const pct = parseFloat(meter.getAttribute("aria-valuenow"));
      if (!isNaN(pct) && pct >= 0 && pct <= 100) {
        pcts.push(pct);
      }
    });

    if (pcts.length < 5) return null;

    // 連続する5つの中で合計が95〜105になるグループを探す
    // (先頭に総合評価バーが含まれる場合があるため)
    let histPcts = null;
    for (let i = 0; i <= pcts.length - 5; i++) {
      const window = pcts.slice(i, i + 5);
      const sum = window.reduce((s, p) => s + p, 0);
      if (sum >= 95 && sum <= 105) {
        histPcts = window;
        break;
      }
    }
    if (!histPcts) return null;

    return {
      ratings: [5, 4, 3, 2, 1],
      percents: histPcts,
    };
  }

  /**
   * テーブル行（TR/LI要素）から星数と割合を読み取る。
   */
  function parseTableRows(rows) {
    const ratings = [];
    const percents = [];

    rows.forEach((row) => {
      const text = row.textContent;
      const starMatch = text.match(/([1-5])\s*(?:つ星|つ☆|star)/i);
      const pctMatch = text.match(/([\d]+)%/);

      // aria-valuenow フォールバック
      const meter = row.querySelector('[role="progressbar"]');
      const pctFromAria = meter
        ? parseFloat(meter.getAttribute("aria-valuenow"))
        : NaN;

      const star = starMatch ? parseInt(starMatch[1], 10) : null;
      const pct = pctMatch
        ? parseFloat(pctMatch[1])
        : !isNaN(pctFromAria)
        ? pctFromAria
        : null;

      if (star !== null && pct !== null) {
        ratings.push(star);
        percents.push(pct);
      }
    });

    if (ratings.length === 0) return null;
    return { ratings, percents };
  }

  /**
   * 加重平均・分散・標準偏差を計算する。
   */
  function calcStats(ratings, percents) {
    const total = percents.reduce((s, p) => s + p, 0);
    const weights = percents.map((p) => p / total);

    const mean = ratings.reduce((s, r, i) => s + r * weights[i], 0);
    const variance = ratings.reduce(
      (s, r, i) => s + weights[i] * Math.pow(r - mean, 2),
      0
    );
    const stddev = Math.sqrt(variance);

    return { mean, variance, stddev };
  }

  /**
   * ページにウィジェットを挿入する。
   */
  function insertWidget(stats, percents, ratings) {
    if (document.getElementById("hensa-widget")) return;

    const { mean, variance, stddev } = stats;

    const sorted = ratings
      .map((r, i) => ({ r, p: percents[i] }))
      .sort((a, b) => b.r - a.r);

    const barRows = sorted
      .map(
        ({ r, p }) =>
          `<div style="display:flex;align-items:center;gap:6px;margin:3px 0;">
            <span style="width:2.5em;text-align:right;font-size:12px;">${r}★</span>
            <div style="flex:1;background:#e0e0e0;border-radius:3px;height:10px;overflow:hidden;">
              <div style="width:${p}%;background:#f0a500;height:100%;border-radius:3px;"></div>
            </div>
            <span style="width:3em;font-size:12px;">${p}%</span>
          </div>`
      )
      .join("");

    // 標準偏差の段階評価
    const polarization = stddev < 0.5
      ? { label: "評価が一致している", color: "#1565c0", bg: "#e3f2fd", bar: 1 }
      : stddev < 1.0
      ? { label: "やや意見が分かれる", color: "#2e7d32", bg: "#e8f5e9", bar: 2 }
      : stddev < 1.5
      ? { label: "評価が分かれている", color: "#f57f17", bg: "#fffde7", bar: 3 }
      : { label: "賛否が大きく分かれる", color: "#b71c1c", bg: "#ffebee", bar: 4 };

    const polarBar = Array.from({ length: 4 }, (_, i) =>
      `<span style="display:inline-block;width:18px;height:18px;border-radius:3px;margin-right:3px;background:${i < polarization.bar ? polarization.color : "#ddd"};"></span>`
    ).join("");

    // 平均値の段階評価
    const rating = mean >= 4.5
      ? { label: "非常に高い評価", color: "#1565c0", bg: "#e3f2fd", stars: 5 }
      : mean >= 4.0
      ? { label: "高い評価",       color: "#2e7d32", bg: "#e8f5e9", stars: 4 }
      : mean >= 3.0
      ? { label: "普通の評価",     color: "#f57f17", bg: "#fffde7", stars: 3 }
      : mean >= 2.0
      ? { label: "低い評価",       color: "#b71c1c", bg: "#ffebee", stars: 2 }
      : { label: "非常に低い評価", color: "#7b1fa2", bg: "#f3e5f5", stars: 1 };

    const ratingStars = Array.from({ length: 5 }, (_, i) =>
      `<span style="font-size:16px;color:${i < rating.stars ? rating.color : "#ddd"};">★</span>`
    ).join("");

    const widget = document.createElement("div");
    widget.id = "hensa-widget";
    widget.style.cssText = `
      background: #fff8e1;
      border: 1px solid #f0a500;
      border-radius: 6px;
      padding: 12px 16px;
      margin: 12px 0;
      font-family: sans-serif;
      font-size: 13px;
      max-width: 420px;
      box-sizing: border-box;
    `;
    widget.innerHTML = `
      <div style="font-weight:bold;margin-bottom:8px;font-size:14px;">📊 レビュー評価の分析</div>
      ${barRows}
      <hr style="border:none;border-top:1px solid #f0c040;margin:10px 0;">
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <div style="flex:1;background:${rating.bg};border-radius:6px;padding:10px 12px;">
          <div style="font-size:11px;color:#555;margin-bottom:4px;">全体の評価</div>
          <div>${ratingStars}</div>
          <div style="font-weight:bold;color:${rating.color};font-size:13px;margin-top:2px;">${rating.label}</div>
          <div style="font-size:11px;color:#888;margin-top:2px;">平均 ${mean.toFixed(2)} / 5.00</div>
        </div>
        <div style="flex:1;background:${polarization.bg};border-radius:6px;padding:10px 12px;">
          <div style="font-size:11px;color:#555;margin-bottom:4px;">二極化の度合い</div>
          <div>${polarBar}</div>
          <div style="font-weight:bold;color:${polarization.color};font-size:13px;margin-top:2px;">${polarization.label}</div>
          <div style="font-size:11px;color:#888;margin-top:2px;">標準偏差 ${stddev.toFixed(3)}</div>
        </div>
      </div>
    `;

    // 挿入先を複数の候補から探す
    const anchors = [
      "#averageCustomerReviews",
      "#reviewsMedley",
      "#cm_cr-review_list",
      "#customer-reviews",
      "#reviewFeatureGroup",
      ".cr-widget-FocalReviews",
    ];
    let inserted = false;
    for (const sel of anchors) {
      const el = document.querySelector(sel);
      if (el) {
        el.insertAdjacentElement("beforebegin", widget);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      const col = document.querySelector("#centerCol, #dp-container");
      if (col) col.prepend(widget);
    }
    console.log("[hensa] widget inserted:", inserted);
  }

  /**
   * ページからレビュー総数を取得する。
   * Amazon JP: "1,234件の評価" / Amazon US: "1,234 ratings"
   */
  function fetchReviewCount() {
    const selectors = [
      "#acrCustomerReviewText",
      "[data-hook='total-review-count']",
      "#averageCustomerReviews .a-size-base",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const match = el.textContent.replace(/,/g, "").match(/(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
    return null;
  }

  function run() {
    const count = fetchReviewCount();
    if (count !== null && count < 10) {
      console.log("[hensa] レビュー数不足のため非表示:", count);
      return true; // 処理済みとして終了
    }

    const dist = fetchRatingDistribution();
    if (!dist) return false;
    const stats = calcStats(dist.ratings, dist.percents);
    insertWidget(stats, dist.percents, dist.ratings);
    return true;
  }

  if (!run()) {
    let attempts = 0;
    const observer = new MutationObserver(() => {
      if (run() || ++attempts > 50) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
