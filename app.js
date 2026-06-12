// ===================================================
//  app.js — منطق التطبيق
// ===================================================

// ── Supabase Client ──────────────────────────────
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ────────────────────────────────────────
let parsedRows = [];
let parsedHeaders = [];
let selectedFile = null;

// ── DOM refs ─────────────────────────────────────
const dropZone     = document.getElementById("drop-zone");
const fileInput    = document.getElementById("file-input");
const fileNameEl   = document.getElementById("file-name");
const previewSec   = document.getElementById("preview-section");
const tableHead    = document.getElementById("table-head");
const tableBody    = document.getElementById("table-body");
const statsRow     = document.getElementById("stats-row");
const previewNote  = document.getElementById("preview-note");
const submitBtn    = document.getElementById("submit-btn");
const companyInput = document.getElementById("company-name");
const toast        = document.getElementById("toast");

// ── Drag & Drop ──────────────────────────────────
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

companyInput.addEventListener("input", updateSubmitBtn);

// ── File Handler ─────────────────────────────────
function handleFile(file) {
  const allowed = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv"
  ];
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["xlsx","xls","csv"].includes(ext)) {
    showToast("❌ نوع الملف مش مدعوم. استخدم xlsx أو xls أو csv", "error");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast("❌ حجم الملف أكبر من 10MB", "error");
    return;
  }

  selectedFile = file;
  fileNameEl.textContent = "📄 " + file.name;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!json.length) {
        showToast("⚠️ الملف فاضي أو مفيهوش بيانات", "error");
        return;
      }

      parsedHeaders = Object.keys(json[0]);
      parsedRows = json;
      renderPreview();
      updateSubmitBtn();
    } catch (err) {
      showToast("❌ حصل خطأ في قراءة الملف", "error");
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── Preview ──────────────────────────────────────
function renderPreview() {
  // Stats
  statsRow.innerHTML = `
    <div class="stat">
      <div class="num">${parsedRows.length.toLocaleString("ar-EG")}</div>
      <div class="lbl">صف</div>
    </div>
    <div class="stat">
      <div class="num">${parsedHeaders.length}</div>
      <div class="lbl">عمود</div>
    </div>
    <div class="stat">
      <div class="num">${(selectedFile.size / 1024).toFixed(1)} KB</div>
      <div class="lbl">حجم الملف</div>
    </div>
  `;

  // Table head
  tableHead.innerHTML = `<tr>${parsedHeaders.map(h => `<th>${h}</th>`).join("")}</tr>`;

  // Table body (max 10 rows preview)
  const previewRows = parsedRows.slice(0, 10);
  tableBody.innerHTML = previewRows.map(row =>
    `<tr>${parsedHeaders.map(h => `<td>${row[h] ?? ""}</td>`).join("")}</tr>`
  ).join("");

  if (parsedRows.length > 10) {
    previewNote.textContent = `عارض أول 10 صفوف فقط — هيترفعوا كل الـ ${parsedRows.length} صف.`;
  } else {
    previewNote.textContent = "";
  }

  previewSec.style.display = "block";
}

// ── Submit Button State ───────────────────────────
function updateSubmitBtn() {
  const ready = companyInput.value.trim() !== "" && parsedRows.length > 0;
  submitBtn.disabled = !ready;
}

// ── Upload to Supabase ────────────────────────────
submitBtn.addEventListener("click", async () => {
  const companyName = companyInput.value.trim();
  if (!companyName || !parsedRows.length) return;

  // Check config
  if (SUPABASE_URL.includes("xxxxxxxxxxxx") || SUPABASE_ANON_KEY.includes("eyJhbGciOi")) {
    showToast("⚙️ ضع بيانات Supabase في ملف config.js الأول", "error");
    return;
  }

  setLoading(true);

  try {
    // 1) Save company record
    const { data: companyData, error: companyErr } = await supabase
      .from("companies")
      .insert({ name: companyName })
      .select()
      .single();

    if (companyErr) throw companyErr;

    const companyId = companyData.id;

    // 2) Save upload record
    const { data: uploadData, error: uploadErr } = await supabase
      .from("uploads")
      .insert({
        company_id: companyId,
        file_name: selectedFile.name,
        row_count: parsedRows.length,
        columns: parsedHeaders,
      })
      .select()
      .single();

    if (uploadErr) throw uploadErr;

    const uploadId = uploadData.id;

    // 3) Save rows in chunks of 500
    const CHUNK = 500;
    for (let i = 0; i < parsedRows.length; i += CHUNK) {
      const chunk = parsedRows.slice(i, i + CHUNK).map(row => ({
        upload_id: uploadId,
        company_id: companyId,
        row_data: row,
        row_index: i + parsedRows.slice(i, i + CHUNK).indexOf(row),
      }));

      const { error: rowErr } = await supabase.from("upload_rows").insert(chunk);
      if (rowErr) throw rowErr;
    }

    showToast(`✅ تم الحفظ! ${parsedRows.length} صف في Supabase`, "success");
    resetForm();

  } catch (err) {
    console.error(err);
    showToast("❌ فشل الحفظ: " + (err.message || "خطأ غير معروف"), "error");
  } finally {
    setLoading(false);
  }
});

// ── Helpers ───────────────────────────────────────
function setLoading(on) {
  if (on) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<div class="spinner"></div> جاري الحفظ...`;
  } else {
    submitBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v14a2 2 0 01-2 2z"/>
        <path d="M17 21v-8H7v8M7 3v5h8"/>
      </svg>
      حفظ في Supabase`;
    updateSubmitBtn();
  }
}

function resetForm() {
  parsedRows = [];
  parsedHeaders = [];
  selectedFile = null;
  companyInput.value = "";
  fileNameEl.textContent = "";
  fileInput.value = "";
  previewSec.style.display = "none";
  tableHead.innerHTML = "";
  tableBody.innerHTML = "";
  statsRow.innerHTML = "";
  updateSubmitBtn();
}

let toastTimer;
function showToast(msg, type = "success") {
  toast.textContent = msg;
  toast.className = `${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 4000);
}