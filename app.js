// Логика теста: рендер вопросов, проверка, подсчёт баллов,
// сохранение в localStorage и отправка отчёта на почту преподавателю.

(function () {
  "use strict";

  // ---- НАСТРОЙКИ ПРЕПОДАВАТЕЛЯ --------------------------------------
  // endpoint из formspree.io, см. ИНСТРУКЦИЯ.md
  var CONFIG = {
    formEndpoint: "ВСТАВЬТЕ_СЮДА_ВАШ_FORMSPREE_ID",
    teacherEmail: "diorlov198611@yandex.ru",
    passPercent: 60
  };
  // -------------------------------------------------------------------

  var state = { answers: {}, index: 0, order: [], done: false };
  var $ = function (id) { return document.getElementById(id); };
  var STORE = "ai_test_state_v1";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;",
               '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---- проверка одного ответа ---------------------------------------
  function isCorrect(q, ans) {
    if (ans === undefined || ans === null || ans === "") return false;
    if (q.type === "single") return Number(ans) === Number(q.correct);
    if (q.type === "true") return Boolean(ans) === Boolean(q.correct);
    if (q.type === "multi") {
      if (!Array.isArray(ans) || !ans.length) return false;
      return ans.slice().sort().join(",") === q.correct.slice().sort().join(",");
    }
    if (q.type === "num") {
      var v = parseFloat(String(ans).replace(",", "."));
      if (isNaN(v)) return false;
      var tol = q.tolerance || 0;
      return q.correct.some(function (c) {
        return Math.abs(v - c) <= tol;
      });
    }
    if (q.type === "text") {
      var norm = function (t) {
        return String(t).toLowerCase().replace(/ё/g, "е")
          .replace(/[^a-zа-я0-9]+/gi, " ").trim();
      };
      var got = norm(ans);
      return q.correct.some(function (c) { return norm(c) === got; });
    }
    return false;
  }

  // ---- рендер вопроса ------------------------------------------------
  function renderQuestion() {
    var q = state.order[state.index];
    var html = '<div class="labtag">'
      + esc(window.LAB_NAMES[q.lab] || "") + "</div>";
    html += '<h3 class="qtext">' + (state.index + 1) + ". " + esc(q.q)
      + "</h3>";

    if (q.type === "single" || q.type === "multi") {
      html += '<div class="opts">';
      q.options.forEach(function (opt, i) {
        var checked = q.type === "single"
          ? state.answers[q.id] === i
          : (Array.isArray(state.answers[q.id]) &&
             state.answers[q.id].indexOf(i) >= 0);
        html += '<label class="opt' + (checked ? " on" : "") + '">'
          + '<input type="' + (q.type === "single" ? "radio" : "checkbox")
          + '" name="ans_' + esc(q.id) + '" value="' + i + '"'
          + (checked ? " checked" : "") + "><span>" + esc(opt)
          + "</span></label>";
      });
      html += "</div>" + hintHtml(q);
    } else if (q.type === "true") {
      html += '<div class="opts">';
      [[true, "Верно"], [false, "Неверно"]].forEach(function (p) {
        var on = state.answers[q.id] === p[0];
        html += '<label class="opt' + (on ? " on" : "") + '">'
          + '<input type="radio" name="ans_' + esc(q.id) + '" value="'
          + p[0] + '"' + (on ? " checked" : "") + "><span>" + p[1]
          + "</span></label>";
      });
      html += "</div>";
    } else {
      html += '<input class="textin" type="text" placeholder="Введите ответ"'
        + ' value="' + esc(state.answers[q.id] || "") + '">'
        + hintHtml(q);
    }
    $("question").innerHTML = html;
    updateProgress();
  }

  function hintHtml(q) {
    if (!q.hint) return "";
    return '<button type="button" class="hintbtn" data-hint="'
      + esc(q.id) + '">Подсказка</button>'
      + '<div class="hint" id="hint_' + esc(q.id) + '" hidden>'
      + esc(q.hint) + "</div>";
  }

  function updateProgress() {
    var answered = state.order.filter(function (q) {
      var a = state.answers[q.id];
      return a !== undefined && a !== "" &&
        (!Array.isArray(a) || a.length);
    }).length;
    $("progText").textContent = "Вопрос " + (state.index + 1) + " из "
      + state.order.length + " · отвечено " + answered;
    $("progressBar").style.width =
      Math.round(state.index / state.order.length * 100) + "%";
  }

function collect() {
    var cur = state.order[state.index];
    if (cur.type === "single" || cur.type === "true") {
      var picked = document.querySelector("#question input:checked");
      if (picked) {
        state.answers[cur.id] = cur.type === "true"
          ? picked.value === "true" : Number(picked.value);
      }
    } else if (cur.type === "multi") {
      var arr = [];
      document.querySelectorAll("#question input:checked").forEach(
        function (i) { arr.push(Number(i.value)); });
      state.answers[cur.id] = arr;
    } else {
      var box = document.querySelector("#question .textin");
      if (box) state.answers[cur.id] = box.value.trim();
    }
  }

  // ---- отчёт ---------------------------------------------------------
  function answerText(q, a) {
    if (a === undefined || a === null || a === "") return "—";
    if (q.type === "single" || q.type === "multi") {
      var idx = Array.isArray(a) ? a : [a];
      return idx.map(function (k) {
        return q.options[k] !== undefined ? String(k + 1) + ") "
          + q.options[k] : "?";
      }).join(" | ");
    }
    if (q.type === "true") return a ? "Верно" : "Неверно";
    return String(a);
  }

  function buildReport(name, group, email) {
    var total = state.order.length, right = 0, lines = [];
    state.order.forEach(function (q, i) {
      var ok = isCorrect(q, state.answers[q.id]);
      if (ok) right++;
      lines.push((i + 1) + ". [" + (ok ? "ВЕРНО" : "НЕВЕРНО") + "] "
        + q.q + "\n     Ответ: " + answerText(q, state.answers[q.id]));
    });
    var pct = Math.round(right / total * 100);
    var grade = pct >= 85 ? 5 : pct >= CONFIG.passPercent ? 4
      : pct >= 40 ? 3 : 2;
    var labs = {}, k;
    state.order.forEach(function (q) {
      if (!labs[q.lab]) labs[q.lab] = { ok: 0, n: 0 };
      labs[q.lab].n++;
      if (isCorrect(q, state.answers[q.id])) labs[q.lab].ok++;
    });
    var labRows = Object.keys(labs).sort(function (a, b) { return a - b; })
      .map(function (lab) {
        return (window.LAB_NAMES[lab] || lab) + ": "
          + labs[lab].ok + "/" + labs[lab].n;
      });

    return {
      right: right, total: total, pct: pct, grade: grade,
      subject: "Тест по ИИ: " + name + " — " + right + "/" + total
        + " (" + pct + "%)",
      body: [
        "Студент: " + name,
        "Группа: " + (group || "—"),
        "Email: " + (email || "—"),
        "Дата: " + new Date().toLocaleString("ru-RU"),
        "",
        "РЕЗУЛЬТАТ: " + right + " из " + total + " (" + pct + "%)",
        "Предварительная оценка: " + grade,
        "",
        "--- ИТОГИ ПО ЛАБОРАТОРНЫМ ---",
        labRows.join("\n"),
        "",
        "--- ПОДРОБНО ---",
        lines.join("\n")
      ].join("\n")
    };
  }

  function sendReport(rep, name, group, email) {
    var ep = CONFIG.formEndpoint;
    if (!ep || ep.indexOf("formspree.io") < 0) {
      return Promise.resolve(false);
    }
    var payload = new URLSearchParams();
    payload.append("name", name);
    payload.append("group", group);
    payload.append("email", email);
    payload.append("message", rep.body);
    payload.append("_subject", rep.subject);
    payload.append("_reply_to", email || CONFIG.teacherEmail);
    return fetch(ep, { method: "POST", body: payload,
      headers: { "Accept": "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return true;
      });
  }

  // ---- экраны результата ---------------------------------------------
  function showSent(rep) {
    var box = $("result");
    box.classList.remove("hidden");
    box.innerHTML = '<h2>Ответы отправлены</h2><p class="lead">'
      + "Результат: <b>" + rep.right + " из " + rep.total + "</b> ("
      + rep.pct + "%). Оценка выставляется преподавателем.</p>"
      + '<pre class="report"></pre>';
    box.querySelector(".report").textContent = rep.body;
    box.scrollIntoView({ behavior: "smooth" });
  }

  function showManual(rep, name, group, email) {
    var box = $("result");
    box.classList.remove("hidden");
    box.innerHTML = '<h2>Отчёт готов</h2>'
      + '<p class="lead">Автоотправка не настроена. Скопируйте текст '
      + 'и отправьте на <b>' + esc(CONFIG.teacherEmail) + "</b>.</p>"
      + '<textarea class="report" rows="16" readonly></textarea>'
      + '<button class="btn" id="copyBtn">Скопировать</button> '
      + '<button class="btn ghost" id="toMailBtn">Открыть почту</button>';
    var ta = box.querySelector(".report");
    ta.value = "Кому: " + CONFIG.teacherEmail + "\nТема: "
      + rep.subject + "\n\n" + rep.body;
    $("copyBtn").onclick = function () {
      ta.select();
      document.execCommand("copy");
      this.textContent = "Скопировано";
    };
    $("toMailBtn").onclick = function () {
      window.location.href = "mailto:" + CONFIG.teacherEmail
        + "?subject=" + encodeURIComponent(rep.subject)
        + "&body=" + encodeURIComponent(rep.body);
    };
    box.scrollIntoView({ behavior: "smooth" });
  }

// Перемешивает варианты ответа, чтобы правильный не был всегда первым.
// Шум задаётся id вопроса: при одном и том же вопросе порядок стабильный.
function mixOptions(q) {
    if (q.type !== "single" && q.type !== "multi") return q;
    var seedNum = 0, s = q.id;
    for (var k = 0; k < s.length; k++) seedNum = (seedNum * 31 + s.charCodeAt(k)) >>> 0;
    var rand = function () {
      seedNum = (seedNum * 1664525 + 1013904223) >>> 0;
      return seedNum / 4294967296;
    };
    var order = q.options.map(function (_, i) { return i; });
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    var correctSet = q.type === "single" ? [q.correct] : q.correct;
    var nextPos = {}, newCorrect = [];
    for (i = 0; i < order.length; i++) nextPos[order[i]] = i;
    for (i = 0; i < correctSet.length; i++) {
      newCorrect.push(nextPos[correctSet[i]]);
    }
    return {
      id: q.id, lab: q.lab, type: q.type, q: q.q, hint: q.hint,
      options: order.map(function (orig) { return q.options[orig]; }),
      correct: q.type === "single" ? newCorrect[0] : newCorrect,
      tolerance: q.tolerance
    };
  }

  // ---- сохранение прогресса -----------------------------------------
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        answers: state.answers, index: state.index,
        fio: $("fio").value, grp: $("grp").value,
        email: $("email").value
      }));
    } catch (e) { /* приватный режим */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function start() {
    state.order = window.QUESTIONS.map(function (q) {
      return mixOptions(q);
    });
    renderQuestion();
    $("startScreen").hidden = true;
    $("testScreen").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function doSend() {
    collect();
    var name = $("fio").value.trim();
    if (!name) {
      $("fio").focus();
      $("nameErr").hidden = false;
      return;
    }
    var group = $("grp").value.trim();
    var email = $("email").value.trim();
    $("sendBtn").disabled = true;
    $("sendBtn").textContent = "Отправляем...";
    var rep = buildReport(name, group, email);
    sendReport(rep, name, group, email).then(function (sent) {
      if (sent) showSent(rep); else showManual(rep, name, group, email);
      reset();
    }).catch(function () {
      showManual(rep, name, group, email);
      reset();
    });
  }

  function reset() {
    $("sendBtn").disabled = false;
    $("sendBtn").textContent = "Отправить ответы";
  }

  function bind() {
    document.addEventListener("change", function (e) {
      if (!e.target.closest || !e.target.closest("#question")) return;
      collect(); save(); renderQuestion();
    });
    document.addEventListener("input", function (e) {
      if (e.target.classList &&
          e.target.classList.contains("textin")) save();
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest) return;
      var b = e.target.closest(".hintbtn");
      if (b) {
        var hid = $("hint_" + b.getAttribute("data-hint"));
        if (hid) hid.hidden = !hid.hidden;
      }
    });
    $("startBtn").addEventListener("click", start);
    $("prevBtn").addEventListener("click", function () {
      collect(); save();
      if (state.index > 0) { state.index--; renderQuestion(); }
    });
    $("nextBtn").addEventListener("click", function () {
      collect(); save();
      if (state.index < state.order.length - 1) {
        state.index++; renderQuestion();
      }
    });
    $("sendBtn").addEventListener("click", doSend);
    $("restartBtn").addEventListener("click", function () {
      if (!confirm("Начать заново? Ответы будут сброшены.")) return;
      try { localStorage.removeItem(STORE); } catch (e) {}
      location.reload();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bind();
    var saved = load();
    if (saved) {
      $("fio").value = saved.fio || "";
      $("grp").value = saved.grp || "";
      $("email").value = saved.email || "";
      if (saved.answers && Object.keys(saved.answers).length) {
        state.answers = saved.answers;
        state.index = saved.index || 0;
      }
    }
    var counter = $("qcount");
    if (counter) counter.textContent = window.QUESTIONS.length;
  });

  window.TEST_STATE = state;
})();
