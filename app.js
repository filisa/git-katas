const STORAGE_KEY = "git-katas-learning-path-v1";

const elements = {
  main: document.querySelector("#main-content"),
  nav: document.querySelector("#kata-nav"),
  overallCount: document.querySelector("#overall-count"),
  overallProgress: document.querySelector(".progress-track"),
  overallFill: document.querySelector("#overall-progress-fill"),
  pathCount: document.querySelector("#path-count"),
  status: document.querySelector("#status-message"),
};

let katas = [];
let currentIndex = 0;
let savedProgress = loadProgress();

function loadProgress() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [
      key,
      {
        checks: Array.isArray(value?.checks) ? value.checks.map(Boolean) : [],
        complete: Boolean(value?.complete),
      },
    ]));
  } catch (error) {
    console.warn("Could not read saved kata progress.", error);
    return {};
  }
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedProgress));
  } catch (error) {
    console.error("Could not save kata progress.", error);
    announce("Progress could not be saved in this browser.");
  }
}

function announce(message) {
  elements.status.textContent = "";
  window.setTimeout(() => {
    elements.status.textContent = message;
  }, 20);
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function renderInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safeHref = /^\s*javascript:/i.test(href) ? "#" : href;
    const external = /^https?:\/\//i.test(safeHref) ? ' target="_blank" rel="noreferrer"' : "";
    return `<a href="${safeHref}"${external}>${label}</a>`;
  });
  return html;
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let listType = "";
  let inCode = false;
  let codeLines = [];
  let inTaskSection = false;
  let taskIndex = 0;

  const flushParagraph = () => {
    if (paragraph.length) {
      output.push(`<p>${paragraph.map(renderInline).join(" ")}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) {
      output.push(`</${listType}>`);
      listType = "";
    }
  };
  const closeTextBlocks = () => {
    flushParagraph();
    closeList();
  };

  for (const line of lines) {
    if (inCode) {
      if (/^\s*```/.test(line)) {
        output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (/^\s*```/.test(line)) {
      closeTextBlocks();
      inCode = true;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      closeTextBlocks();
      const depth = heading[1].length;
      const headingText = heading[2].replace(/[*`]/g, "").trim();
      inTaskSection = depth <= 2 && /^(the\s+)?task$/i.test(headingText);
      output.push(`<h${Math.min(depth, 3)}>${renderInline(headingText)}</h${Math.min(depth, 3)}>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    if (ordered || unordered) {
      flushParagraph();
      if (inTaskSection) {
        closeList();
        taskIndex += 1;
        const content = (ordered || unordered)[1];
        output.push(
          `<label class="task-row">` +
          `<input type="checkbox" data-task-index="${taskIndex - 1}" aria-label="Mark as complete: ${escapeHtml(content)}">` +
          `<span class="task-index">${String(taskIndex).padStart(2, "0")}</span>` +
          `<span class="task-copy">${renderInline(content)}</span></label>`,
        );
        continue;
      }
      const nextListType = ordered ? "ol" : "ul";
      if (listType !== nextListType) {
        closeList();
        output.push(`<${nextListType}>`);
        listType = nextListType;
      }
      output.push(`<li>${renderInline((ordered || unordered)[1])}</li>`);
      continue;
    }

    if (!line.trim() || /^\s*---+\s*$/.test(line)) {
      closeTextBlocks();
      continue;
    }

    paragraph.push(line.trim());
  }

  closeTextBlocks();
  if (inCode) output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  return output.join("\n");
}

function readLearningPath(readme) {
  const heading = "## Suggested Learning Path";
  const start = readme.indexOf(heading);
  if (start < 0) throw new Error("The Suggested Learning Path section was not found in README.md.");
  const contentStart = start + heading.length;
  const nextSection = readme.indexOf("\n## ", contentStart);
  const section = readme.slice(contentStart, nextSection < 0 ? undefined : nextSection);

  const result = [];
  for (const line of section.split("\n")) {
    const match = line.match(/^- \[([^\]]+)\]\(\.\/([^/]+)\/README\.md\)/);
    if (match) result.push({ title: match[1], directory: match[2] });
  }
  if (!result.length) throw new Error("No kata links were found in README.md's Suggested Learning Path.");
  return result;
}

function countCompleted() {
  return katas.filter((kata) => savedProgress[kata.directory]?.complete).length;
}

function updateOverallProgress() {
  const complete = countCompleted();
  const percent = katas.length ? Math.round((complete / katas.length) * 100) : 0;
  elements.overallCount.textContent = `${complete} of ${katas.length} katas complete`;
  elements.overallFill.style.width = `${percent}%`;
  elements.overallProgress.setAttribute("aria-valuenow", String(percent));
  elements.pathCount.textContent = `${katas.length} KATAS`;
}

function renderNavigation() {
  elements.nav.innerHTML = katas.map((kata, index) => {
    const completed = Boolean(savedProgress[kata.directory]?.complete);
    return `<button class="kata-link" type="button" data-kata-index="${index}"` +
      `${index === currentIndex ? ' aria-current="step"' : ""}>` +
      `<span class="kata-number">${String(index + 1).padStart(2, "0")}</span>` +
      `<span class="kata-name">${escapeHtml(kata.title)}</span>` +
      `<span class="kata-check" aria-label="${completed ? "Complete" : "Not complete"}">${completed ? "✓" : ""}</span>` +
      `</button>`;
  }).join("");

  elements.nav.querySelectorAll("[data-kata-index]").forEach((button) => {
    button.addEventListener("click", () => openKata(Number(button.dataset.kataIndex)));
  });
}

function saveTaskChecks(kata, taskCount) {
  const inputs = [...elements.main.querySelectorAll("[data-task-index]")];
  const completedTasks = inputs.filter((input) => input.checked).length;
  const complete = taskCount > 0 && completedTasks === taskCount;
  savedProgress[kata.directory] = {
    checks: inputs.map((input) => input.checked),
    complete,
  };
  saveProgress();
  updateOverallProgress();
  renderNavigation();
  updateCompletion(kata, taskCount, completedTasks);
  announce(`${completedTasks} of ${taskCount} tasks checked off for ${kata.title}.`);
}

function updateCompletion(kata, taskCount, completedTasks) {
  const banner = elements.main.querySelector(".completion-banner");
  const nextKata = katas[currentIndex + 1];
  if (completedTasks === taskCount && taskCount > 0) {
    if (banner) banner.remove();
    const nextMessage = nextKata
      ? `That’s another one in the books. ${escapeHtml(nextKata.title)} is up next.`
      : "That’s the whole learning path. You showed up and put in the reps.";
    const card = elements.main.querySelector(".kata-document");
    card.insertAdjacentHTML("beforeend",
      `<div class="completion-banner" role="status">` +
      `<span class="completion-icon" aria-hidden="true">✓</span>` +
      `<div><strong>Kata complete — nice work!</strong><p>${nextMessage}</p></div></div>`);
  } else if (banner) {
    banner.remove();
  }
  const count = elements.main.querySelector(".task-count");
  if (count) count.textContent = `${completedTasks} / ${taskCount} checked`;
}

async function openKata(index) {
  if (index < 0 || index >= katas.length) return;
  currentIndex = index;
  const requestedIndex = index;
  renderNavigation();
  const kata = katas[currentIndex];
  elements.main.innerHTML = `<div class="loading-state" role="status"><span class="loading-mark" aria-hidden="true">g</span><p>Opening ${escapeHtml(kata.title)}…</p></div>`;

  try {
    const response = await fetch(`./${encodeURIComponent(kata.directory)}/README.md`);
    if (!response.ok) throw new Error(`${kata.directory}/README.md returned ${response.status}.`);
    const markdown = await response.text();
    if (requestedIndex !== currentIndex) return;
    const heading = markdown.match(/^#\s+(.+)$/m);
    const description = markdown.split("\n").find((line) =>
      line.trim() && !line.startsWith("#") && !/^---+$/.test(line.trim()),
    ) || "";
    const rendered = renderMarkdown(markdown);
    const taskCount = (rendered.match(/class="task-row"/g) || []).length;
    const progress = savedProgress[kata.directory] || { checks: [] };
    const completeCount = Math.min(progress.checks?.filter(Boolean).length || 0, taskCount);
    const isComplete = taskCount > 0 && completeCount === taskCount;
    savedProgress[kata.directory] = { checks: (progress.checks || []).slice(0, taskCount), complete: isComplete };
    saveProgress();
    updateOverallProgress();

    elements.main.innerHTML =
      `<div class="kata-header">` +
      `<div class="kata-kicker">Kata ${String(currentIndex + 1).padStart(2, "0")} of ${String(katas.length).padStart(2, "0")}</div>` +
      `<h1 class="kata-title">${escapeHtml(heading?.[1] || kata.title)}</h1>` +
      `<p class="kata-description">${escapeHtml(description.replace(/^#+\s*/, ""))}</p>` +
      `</div>` +
      `<section class="content-card" aria-label="Kata instructions">` +
      `<div class="card-topline"><h2>Your practice</h2><span class="task-count">${completeCount} / ${taskCount} checked</span></div>` +
      `<div class="kata-document">${rendered}</div></section>` +
      `<footer class="kata-footer"><span class="footer-hint">Check off each step as you go. Your progress saves automatically.</span>` +
      `<div class="footer-actions">` +
      `<button class="nav-button previous" type="button" ${currentIndex === 0 ? "disabled" : ""}>← Previous</button>` +
      `<button class="nav-button next" type="button">${currentIndex === katas.length - 1 ? "Finish path" : "Next kata"} <span aria-hidden="true">→</span></button>` +
      `</div></footer>`;

    elements.main.querySelectorAll("[data-task-index]").forEach((input) => {
      input.checked = Boolean(progress.checks?.[Number(input.dataset.taskIndex)]);
      input.addEventListener("change", () => saveTaskChecks(kata, taskCount));
    });
    elements.main.querySelector(".previous").addEventListener("click", () => openKata(currentIndex - 1));
    elements.main.querySelector(".next").addEventListener("click", () => {
      if (currentIndex < katas.length - 1) {
        openKata(currentIndex + 1);
      } else {
        elements.main.focus();
        announce("You reached the end of the learning path. Congratulations!");
      }
    });
    if (isComplete) updateCompletion(kata, taskCount, completeCount);
  } catch (error) {
    if (requestedIndex !== currentIndex) return;
    console.error("Could not open kata instructions.", error);
    elements.main.innerHTML =
      `<section class="error-state" role="alert"><h1>Couldn’t open this kata</h1>` +
      `<p>${escapeHtml(error.message)} Make sure the site is being served from the repository root, not opened directly as a file.</p>` +
      `<p>For example, run <code>python3 -m http.server</code> in the repository and open <code>http://localhost:8000</code>.</p>` +
      `<button class="nav-button" type="button">Try again</button></section>`;
    elements.main.querySelector("button").addEventListener("click", () => openKata(currentIndex));
  }
}

async function start() {
  try {
    const response = await fetch("./README.md");
    if (!response.ok) throw new Error(`README.md returned ${response.status}.`);
    katas = readLearningPath(await response.text());
    updateOverallProgress();
    renderNavigation();
    await openKata(0);
  } catch (error) {
    console.error("Could not load the Git Katas learning path.", error);
    elements.main.innerHTML =
      `<section class="error-state" role="alert"><h1>Couldn’t load the learning path</h1>` +
      `<p>${escapeHtml(error.message)} Make sure the site is being served from the repository root, not opened directly as a file.</p>` +
      `<p>For example, run <code>python3 -m http.server</code> in the repository and open <code>http://localhost:8000</code>.</p></section>`;
  }
}

start();
