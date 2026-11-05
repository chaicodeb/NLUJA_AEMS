# NLUJA, Assam — Demo Script

Presentation and demonstration for RFP No. NLUJAA/ACAD-ADMIN/F/MISC/2024-25/510
(evaluation weight: 10% presentation/PoC, and evidence for the 20% "understanding of scope" score).

Target length: **25–30 minutes** plus Q&A. Every act lists the RFP sections it proves and a **fallback** stage to jump to if anything goes wrong live.

---

## Before the panel arrives (10 minutes)

1. Start Docker Desktop (local database), then in `d:\Uni_demo\nluja-ems` run `npm run dev` (or open the hosted URL).
2. Open the app in Chrome, full screen (F11), browser zoom 90%.
3. Sign in as **Controller of Examinations** (OTP `246810`).
4. On the dashboard, use **Presenter → 1. Fresh start → Jump**. Everyone is signed out and the data is rebuilt.
5. Keep a phone ready to scan QR codes (works only on the hosted URL or the same Wi-Fi network).
6. Keep this script open on a second screen.

**Demo accounts** (click on the login page; all passwords `Demo@123`; key icon = OTP `246810`):

| Role | Name | Used in act |
|---|---|---|
| Controller of Examinations 🔑 | Dr. R. Baishya | 1, 2, 3, 5, 6, 7, 8A |
| Examination Branch 🔑 | Mr. D. Kalita | 7 |
| Academic Section | Ms. J. Bora | 2 (optional) |
| Faculty | Dr. Ananya Bora (BL3.5 marks sheet), Dr. Rituraj Gogoi (BL9.2 class) | 2A, 2B |
| Head of Department (Dean) | Prof. N. Goswami | 2A, 2B |
| Vice-Chancellor | Prof. (Dr.) A. K. Sharma | 3, 7 |
| Evaluator 🔑 | Prof. S. Hazarika / Dr. M. Lalremruati | 6, 8A |
| Student | Aditi Baruah (registers live), Rahul Kalita (attendance alert, blocked paper), Sneha Iyer (LL.M., revaluation), Arindam Hazarika (backlog) | 2B, 4, 8, 8A, 8B |
| Parent | Mr. Pranab Baruah | 8 |

**Stage jumps** (dashboard of COE/Admin → Presenter): Fresh start · Eligibility decided · Students registered · Admit cards published · Exam conducted · Evaluation complete · Results processed · Results published · Revaluation window · Supplementary exam.

---

## Opening (1 minute)

> "NLUJA asked for a configurable, institution-driven system — not a generic ERP. In the next 25 minutes we will take one real examination cycle — your odd-semester 2026-27 end-semester examination — from attendance eligibility to a digitally signed grade sheet, using your own curriculum, your evaluation schemes and your grading regulation. All data is synthetic; all rules are yours."

---

## Act 1 — Secure access (2 min) · RFP §11.1, §14, §13 (SSO)

1. Login page: point out role-based demo accounts and the SSO note (Google Workspace / Microsoft 365 via SAML 2.0 / OAuth 2.0 in production).
2. Click **Controller of Examinations** → OTP screen. Type `111111` → *"Incorrect one-time password"* (logged). Then `246810`.
3. Header shows the **2FA** badge.

> "Every examination-critical role — COE, Examination Branch, evaluators, IT — requires a second factor. Failed attempts land in the audit trail; we'll see them at the end."

---

## Act 2 — Your academic structure and the rule engine (4 min) · RFP §6.3(a)(c), §8.2, §9.2

1. **Programmes & Curricula**: the 2022 B.A. LL.B. batch runs on the 2019 curriculum (5 credits/course); the 2025 batch on the revised 2025-26 curriculum (4 credits, 212 credits). *"A revision never touches earlier batches."*
2. **Evaluation Schemes**: B.A. LL.B. Sem IX–X (30 + 70); **Project Work and Moot Court** (report 30, viva 20, memorial 25, oral 25 with five criteria); **LL.M. taught paper** with component minimums 35/10/5.
3. **Rule Configuration → B.A. LL.B. attendance & examination eligibility**:
   - Parameters: 70% per course; VC may relax to 65% if aggregate ≥ 70%.
   - **Test this rule** presets (the RFP's own acceptance cases a–c):
     - `69% / agg 78%` → *ineligible, may apply for relaxation*
     - `67% / agg 74% + VC` → *RELAXED*
     - `64% / agg 80%` → *below the 65% floor — not relaxable*
   - Show **Compiled rule** (JSON-Logic): *"generated from the parameters — your staff never write code."*
   - Show **Version history**.

> "This is the RFP's Section 6.3: attendance, grading and grace are configured by the Academic Section and COE. No vendor change request."

---

## Act 2A — Faculty internal marks entry (4 min) · NIQ 3 (internal assessment) · RFP §8.4, §14.1

*Run at* **Fresh start**. *Fallback:* any later stage has both sheets completed and verified.

1. **Switch → Dr. Ananya Bora (Faculty) → Dashboard**: *"Enter internal marks (1 sheet open)"* → **Internal Marks** → her 13 sheets; **BL3.5 Jurisprudence — Written Project** is a draft, 8/10 entered.
2. Open it. Type **25** for BAL25-004 → flagged *"outside 0–20"* instantly. Correct it to **14**; enter **12.5** for BAL25-008 (Enter moves down). Statistics update live (mean, range, distribution).
3. Point out **Excel template** / **Import Excel**: the same sheet can be filled offline; wrong roll numbers or out-of-range marks are rejected with row-level messages.
4. **Save draft** → **Submit & sign** → confirm. The sheet is now read-only, signed, and timestamped.
5. **Switch → Prof. N. Goswami (Dean) → Dashboard**: *"2 internal-marks sheet(s) awaiting verification"*.
   - Open **BL3.5** → review distribution → **Verify & lock** (the system re-checks the teacher's signature first).
   - Open **BL3.6 Special Contracts — Mid-Semester** (Dr. Gogoi) → optionally **Return for correction** with a note, or **Verify & lock**.
   - **With teachers** filter → **Remind** sends SMS/e-mail (logged).
6. **Result Processing** readiness checklist (as COE) shows *"38/38 sheets verified"* once both sheets are verified. *"Any sheet still with a teacher makes that course **W — withheld**, never a silent zero."*

> "Only the course teacher can enter; only the Dean or COE can verify; only the COE can unlock a verified sheet — with a reason, and never after results are published."

---

## Act 2B — Daily attendance and shortage alerts (4 min) · NIQ 3 (attendance) · RFP §8.2, §13 (biometric integration)

*Run at* **Fresh start**, *before Act 3* (eligibility uses these totals). *Fallback:* any later stage has the class marked and the leave approved.

1. **Switch → Dr. Rituraj Gogoi (Faculty) → Dashboard**: *"Take attendance (1 class awaiting)"* → today's **BL9.2 Taxation, 10:30 am**.
2. The roll starts as all-present; every row shows the student's course attendance and where it will land. **Fetch biometric punches** → punch times fill in; **Rahul Kalita** and **Akash Borah** did not punch. Rahul's projection turns red: **70.6% → 69.2% — Below minimum**.
3. **Save attendance** → *"1 attendance alert sent to students and parents — Rahul Kalita, BL9.2 now 69.2%"*. *"No one had to run a report: the rule did it."*
4. **Switch → Rahul Kalita (Student)** → dashboard banner → **My Attendance**: course-wise %, *"Final: 69.2% — below 70%; relaxation may be sought"*, alert history, recent absences, **Apply for leave**.
5. **Switch → Prof. N. Goswami (Dean) → Leave Applications**: Moumita Gogoi's **duty leave** (national moot, 8–9 Oct) → **Approve** → 10 class records become *duty leave*, counted as attendance. Priyanka's approved **medical leave** (14–18 Sept) is shown as evidence on the VC's relaxation request in Act 3.
6. **Attendance Register**: shortage watch — below floor / below minimum / close / alerts sent; **Send shortage notices** issues formal notices to every student below the minimum.

> "Teachers can change a class on the day they mark it; any later correction needs a reason and is logged. Another teacher cannot open the register at all."

---

## Act 3 — Eligibility and the Vice-Chancellor's relaxation (4 min) · RFP §8.2 (BCI acceptance criteria a–f), §14

1. **Examinations → End Semester Examination (Odd Semester), 2026-27 → Eligibility → Run eligibility check**.
   - Result: **150 eligible · 5 ineligible · 1 pending relaxation**.
   - Filter **Ineligible**: Rahul Kalita 69.2% (relaxable), Imtiaz Hussain 63.5% (below floor), Neha Das (aggregate 69.6% — not relaxable), Karan Mehta (LL.M. 73.1% < 75% — UG and PG thresholds are different rules).
2. (Optional, strong) Back to **Rule Configuration → B.A. LL.B.**: type `75` in *Minimum semester attendance* → **Preview impact** → *"2 of 108 decisions would change — Neha Das"*. Click **Discard changes**.
3. **Switch role → Vice-Chancellor**. Dashboard: *"1 attendance relaxation request awaiting your decision."*
4. **Attendance Relaxations**: Priyanka Saikia, ADR 67.31%, aggregate 77.69%, medical grounds → note → **Approve** → *"student is now eligible."*

> "Only the authority named in the rule can decide. If the rule said COE instead of VC, the VC's approve button would be refused — and logged."

**Fallback:** Jump → *Eligibility decided*.

---

## Act 4 — Student self-registration (3 min) · RFP §8.5, §8.14

1. **Switch role → Student · Rahul Kalita → Exam Registration**: Taxation is disabled with *"69.23% < 70% — may apply for relaxation"*. Proceed → pay → his registration excludes Taxation.
   - *Acceptance criterion: "a student ineligible under a configured rule is blocked from submission with the specific reason displayed."*
2. **Switch role → Student · Aditi Baruah → Exam Registration**: all four papers eligible → **Proceed to payment → UPI → Pay ₹1,500 & submit**. Payment reference generated.

**Fallback:** Jump → *Students registered* (Aditi left unregistered for you).

---

## Act 5 — Seating and admit cards (3 min) · RFP §8.5

1. **Switch role → COE → Examinations → Registrations → Simulate student registrations** (registers everyone else). Show fees collected.
2. **Seating & admit cards → Generate seating plan** → toast: *"0 same-paper adjacencies"*.
   - Open session **23 Nov · FN (BL9.1 + ML1.1)**: blue/orange checkerboard — B.A. LL.B. and LL.M. alternate.
   - Invigilator shown per room; *"a paper's setter is never assigned to invigilate that session."* Flying squad listed.
   - **Print attendance sheets** (room-wise, bench, roll no., booklet no., signature).
3. **Publish admit cards** → registration closes.
4. **Switch role → Aditi → Dashboard → Admit card**: PDF with barcode, schedule, room and bench, QR, digital signature. Scan the QR → **Authentic Admit Card** with centre/room/bench.

**Fallback:** Jump → *Admit cards published*.

---

## Act 6 — Exam conduct and anonymous on-screen evaluation (5 min) · RFP §8.5, §8.6, §14.1

1. **COE → Examination → Scripts & evaluation → Conduct examination & scan scripts (simulate)**.
   - ~150 scripts, 1 absent (Lalrinpuii Ralte, BL9.4).
   - Expand **chain of custody**: collected → sealed → strong room → barcoded & masked → scanned.
2. **Evaluator allocation**: in BL9.1 *Round 2* choose **Dr. Ananya Bora** → refused: *"set the question paper … cannot evaluate it."* Choose **Prof. S. Hazarika** → refused: *"independent evaluators are required."*
3. **Switch role → Evaluator · Prof. S. Hazarika** (OTP) → **My Evaluations** → open a pending **BL9.2** script.
   - Cover: roll no. and signature **masked**, barcode sticker with dummy number only.
   - Use **Tick / Comment** on an answer page.
   - Enter marks; type `18` for Q5 → *"Q5 exceeds 14"* and Submit disabled. Fix to `12` → **Submit & lock** → *"digitally signed… marks posted to Result Processing"* → moves to next script. Do the second one quickly.
4. (Optional) **Switch → Dr. M. Lalremruati** → the BL9.1 round-2 script: *"Blind double evaluation — other evaluators' marks are not visible."* A >15% disagreement auto-assigns a third evaluator.

**Fallback:** Jump → *Exam conducted* (3 evaluations pending) or *Evaluation complete*.

---

## Act 6A — Moderation of an out-of-line paper (3 min) · NIQ 3 (moderation) · RFP §8.7

*Run at* **Evaluation complete**, *before Act 7. Fallback:* **Results processed** has the moderation applied.

1. **COE → Moderation**: every paper's candidates, mean, standard deviation and course pass rate against **MOD-NLUJA** (flag if pass rate < 75% or mean < 55%). **BL3.4 Economics** is flagged — mean 41.4%.
2. **Propose moderation** → the cap is 2.5 marks (5% of 50); live preview *"pass rate 80% → 100%; would pass: Nabajit Medhi, Debojit Mahanta"* → record the board's reasoning → **Submit proposal**.
3. **Switch → Vice-Chancellor → Moderation** → **Approve** → *"applied to 10 candidates"*. The proposer could not have approved it (blocked and logged).
4. In Act 7 the BL3.4 results carry a **MODERATED +2.5** flag; the evaluated script marks are unchanged, so revaluation and scrutiny still work on the original evaluation.

> "One uniform addition, capped by your rule, approved by the Vice-Chancellor, before results — never a silent change to an individual mark."

---

## Act 7 — Result processing, maker–checker, publication (5 min) · RFP §8.7, §14.1, §18 (UAT criterion), §28

1. **Switch role → Examination Branch** (OTP) → dashboard: *"All scripts evaluated — process results"* → **Result Processing**: readiness checklist and the exact rule versions that will be applied → **Process results**.
2. On the run: stats, grade distribution → **Show flagged only**:
   - **Sourav Singha** — Taxation 48 → **+2 grace → 50 → C** (within GRACE-NLUJA limits).
   - **Arindam Hazarika** — ADR 41 → **F** (shortfall 9 exceeds grace limit).
   - **Lalrinpuii Ralte** — **AB**; **Rahul / Imtiaz / Neha** — **NA**.
   - Tab **LL.M.**: **Sneha Iyer** — aggregate 59 but Written 32 < 35 → **F**, flagged *"aggregate pass, component fail"*; **Rohit Barman** — Seminar 9 < 10 → F.
   - Expand a student: component marks, minimums, grace, grade, SGPA formula.
3. Notice: *"You processed this run. Approval must be given by a different officer."*
4. **Verification workbook (Excel)** → open → **Summary: 168/168 grades, 30/30 SGPA, 30/30 CGPA match** — every value recomputed by live Excel formulas. *(RFP: "matches an independent manual computation to the last decimal place.")*
5. **Switch → COE → Verify & approve**. **Switch → Vice-Chancellor → Publish results** → grade sheets issued.

**Fallback:** Jump → *Results processed* or *Results published*.

---

## Act 8 — Grade sheet, transcript, verification, parent view (3 min) · RFP §8.8, §8.14, §13 · NIQ 3.7

1. **Switch → Aditi → Results & Grade Sheets**: SGPA, CGPA, class → **Download grade sheet** (QR, barcode, signature, legend) → scan QR → **Authentic Semester Grade Sheet**.
2. Same page → **Consolidated transcript → Download student copy**: all nine semesters on one page (migrated Sem I–VIII + this semester), CGPA, credits 225/250, classification, *STUDENT COPY* watermark.
3. **Switch → Registrar → Students → Rahul Kalita → Consolidated transcripts**: purpose *"Enrolment — Bar Council of Assam"* → **Issue official transcript** → open PDF / scan QR → *Authentic Consolidated Transcript* (classification withheld while a backlog is pending).
4. **Switch → Parent** → same data, read-only, consent note (DPDP Act 2023).

> "In production these documents are pushed to DigiLocker / NAD and credits to ABC via their APIs."

---

## Act 8A — Revaluation and scrutiny (4 min) · NIQ 3 (re-evaluation / scrutiny) · RFP §8.7, §14.1

*Fallback:* **Presenter → Revaluation window → Jump**. Sneha's revaluation and Tenzing's scrutiny are already filed.

1. **Switch → Aditi → Results & Grade Sheets → Revaluation & scrutiny**: deadline (15 days after publication), fees, paper-wise marks → **Apply** on BL9.1 → *Scrutiny / re-totalling — ₹300* → **Pay & apply**. Scrutiny runs immediately.
2. **Switch → COE → Revaluation & Scrutiny**:
   - Aditi's scrutiny checklist: every question marked in both rounds, totals add up, nothing above maximum, final = mean of rounds, posted mark matches → **Apply rule & decide** → *no discrepancy, marks unchanged*.
   - **Sneha Iyer (LL.M.), ML1.3, Written 32/70 → F.** Open the evaluator list: the **paper setter** and the **original evaluator** are flagged. Try assigning the setter → refused and logged (`SEGREGATION_VIOLATION_BLOCKED`). Assign **Prof. S. Hazarika**.
3. **Switch → Prof. S. Hazarika → My Evaluations**: the script shows a *Revaluation* badge; dummy number only, *original marks hidden*. Mark Q1–Q5 = 8, 8, 7, 8, 7 (**38**) → **Submit & lock**.
4. **Switch → COE → Revaluation & Scrutiny**: original 32 → revalued 38, change +6 against a threshold of ±3.5 (5% of 70) → **Apply rule & decide** → *Result amended*.
5. **Switch → Sneha → Results**: ML1.3 now **A**, SGPA 7.20 FAIL → **8.80 PASS**; grade sheet carries *REVISED — after revaluation of ML1.3 · supersedes …*. Verify the **old** code → *Document superseded / revoked — replaced by …*.

> "Window, fees, threshold and whether marks may go down are all in **Rule Configuration → Revaluation & scrutiny policy**, versioned like every other rule. Every step — application, assignment, blocked assignment, amendment — is in the audit trail."

---

## Act 8B — Supplementary (backlog & improvement) examination (4 min) · NIQ 3 (backlog/improvement) · RFP §8.5, §8.7

*Fallback:* **Presenter → Supplementary exam → Jump** — exam created, Lalrinpuii (absent in BL9.4) and Sourav (improvement in BL9.2) already registered.

1. **COE → Supplementary Exams**: rule **SUP-NLUJA** (₹1000/paper, improvement for grades B and below, better of two attempts). If not yet created: **Create supplementary examination** — papers scheduled in January automatically.
2. **Switch → Arindam Hazarika (Student) → Exam Registration**: BL9.3 (F, 41/100) pre-selected as **Backlog**; B/C grades offered for **Improvement**; BL9.5 (moot) not offered. **Pay & register**. (*Neha Das's attendance-shortage papers are refused — "must repeat the course".*)
3. **Switch → Examination Branch (Mr. Kalita) → Supplementary Exams** → award lists: **BL9.2 Sourav 45**, **BL9.3 Arindam 38**, **BL9.4 Lalrinpuii 52** → submit each → **Process results**.
4. Same maker–checker as Act 7: **COE approves**, **VC publishes** → 3 supplementary grade sheets.
   - Arindam BL9.3 **F → C**, semester **FAIL → PASS**, SGPA 4.6 → 5.6.
   - Lalrinpuii BL9.4 **AB → A+**, semester **PASS**.
   - Sourav BL9.2 **C → B** (better of the two attempts kept).
5. **Switch → Arindam → Results**: the supplementary grade sheet is the current one; academic history and the transcript count semester IX once.

> "Internal marks carry forward, only the end-semester paper is retaken, and CGPA, grade sheets and transcripts update through the same verified pipeline."

---

## Act 9 — Reports, dashboards and the audit trail (3 min) · RFP §6.3(b), §8.15, §10.2, §11, §22

1. **Switch → Vice-Chancellor → Dashboard**: action items, attendance distribution, results by batch with average SGPA.
2. **Report Builder** → saved **"Average CGPA by social category (AISHE)"** → Open. Then build one live: *Course-wise results*, group by *Grade*, Count → **Save**. *"Your Registrar's office builds this, no vendor."*
3. **Audit Trail** (as COE or VC): **"Chain verified — no tampering detected"**; filter `MFA_FAILED`, `ACCESS_DENIED`, `SEGREGATION_VIOLATION_BLOCKED`, `RULE_CHANGED`; expand a rule change to see before/after; **Export CSV**.

---

## Close (1 minute)

> "What you saw is your own regulation running end-to-end: BCI attendance with VC relaxation, component-wise LL.M. minimums, moot-court weighting, grace within limits, anonymous double evaluation, maker–checker results and verifiable documents — all configurable by NLUJA staff, all audited.
> In production we add Keycloak SSO with your Google/Microsoft identity, DSC/eSign-based signatures, DigiLocker–NAD–ABC, payment-gateway and biometric integrations, 300 DPI scanning stations, Assamese/Hindi screens and Android/iOS apps, hosted on a MeitY-empanelled cloud in India or on your campus."

---

## Likely questions — short answers

| Question | Answer |
|---|---|
| Can our staff change a rule mid-semester? | Yes — new version with mandatory reason; preview impact first; every decision records the rule version used. |
| What if two evaluators disagree? | Beyond 15% of max marks a third evaluator is auto-assigned; final = mean of the closest two. Threshold is configurable. |
| Can the COE change a locked mark? | Only via a logged override with a reason; evaluator re-submits and re-signs. |
| Where is data hosted? | MeitY-empanelled Indian cloud (Tier III+) or NLUJA campus; AES-256 at rest, TLS 1.2+ in transit; daily backups, RPO 24h / RTO 8h. |
| How do you prove results are correct? | The Excel verification workbook for every run, plus the hash-chained audit trail. |
| Vendor lock-in? | Source code and data owned by NLUJA, escrow, documented export (RFP §31). |
| Samarth data? | Migrated with reconciliation (legacy SGPA/CGPA history is already visible in student records). |
| Concurrent load at result day? | Stateless app tier scales horizontally; results are pre-computed, publication is a status change. |

---

## Known demo simplifications (be upfront if asked)

- SSO, DSC/eSign, DigiLocker/NAD/ABC, payment gateway, SMS and biometric devices are **simulated** (UI and data flow are real; external calls are stubbed).
- Answer booklets are rendered stand-ins for scanned images; production uses 300 DPI PDF/A scans.
- Non-scenario marks are generated, so exact numbers for "ordinary" students can vary between runs; the scenario students above always behave as described.

---

## Backup recording

Record each act as a separate clip so a single failure doesn't cost the whole video:

1. Windows: **Win + Alt + R** (Xbox Game Bar) records the active window; or OBS Studio at 1920×1080, 30 fps.
2. Before each act, use the Presenter jump to the act's start stage.
3. Keep clips 2–5 minutes; name them `01-access.mp4`, `02-rules.mp4`, …
4. Store on the laptop **and** a USB drive; test playback on the venue's machine if possible.
