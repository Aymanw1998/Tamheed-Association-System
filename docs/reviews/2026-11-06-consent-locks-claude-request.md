Actual Claude Code review request — 2026-11-06. Codex is sole implementer; you are the independent reviewer. Read only this explicit source/test packet; no tools, edits, other files, services, recursive reviewers or publication. Return concrete regressions with file/line and scenario; distinguish missing context. No environment files, credentials, runtime logs or real user records are included.

Owner request: parent rules available by default and editable by management; after the photo, a laws link opens agree/disagree + signature/stamp canvas. Agreement + guardian name required at intake. Owner permits stamp later, so a missing stamp is visibly pending, never signed. Complete it on the protected student page with the existing students.parentLink permission. Preserve existing signed evidence and recover a failed student-marker write. Version 0 is the immutable built-in default, superseded by published versions without replacing old evidence. A deliberately empty published version still closes intake.

Owner also requests program A held while adding students, showing the other holder. The view-page add picker holds the existing lesson lock across search/add; edit forms already hold it. Automatic educational-program changes acquire affected locks before saving the student, sorted/deduplicated, preserving tab-owned locks. Roster deltas use updatedAt compare-and-set; automatic additions retry current data and manual stale writes return 409. Lock service has a unique key and 120-second heartbeat TTL. These writes do not introduce multi-document DB transactions or a durable reconciliation queue; DB outages beyond isolated tests are not claimed handled. Actual browser/phone, SMTP and production DB were not used.

Review the pending consent persistence, retries, permissions and lock lifetime/races. Current rules publishing still uses immutable rows; existing student confidentiality and invite-token/known-ID generic replies remain required. Verification is being run locally; an earlier full run found one obsolete test fake without updateExisting, now corrected.

SOURCE server/Entities/InviteToken/defaultRules.js lines 1-11
1: // Owner-provided version 0, available until management publishes another version.
2: const DEFAULT_RULES = String.raw`1- أتعهد بالالتزام ببرنامج الجمعيّة.
3:
4: 2- أوافق على أنّ ابني سيشارك في دورة كرة القدم في الجمعية ولن يشارك بأيّ دورة كرة قدم خارج نطاق الجمعية في المقابل.
5:
6: 3- أقرّ بأنّ ابني\ابنتي لا يعاني من عائق صحّيّ يمنعها من المشاركة في الفعاليات الرّياضيّة جميعها. (تجاهلوا البند في حال وجود عائق صحّي)
7:
8: 4- لا أمانع من مشاركة صور ابني \ ابنتي عبر منصّات التّواصل الاجتماعيّ أو الإعلام خلال الفعاليّات.`;
9:
10: module.exports = { DEFAULT_RULES };
11:

SOURCE server/Entities/InviteToken/InviteToken.controller.js lines 1-397
1: const crypto = require("crypto");
2: const { DEFAULT_RULES } = require("./defaultRules");
3: const { InviteTokenModelDef } = require("./InviteToken.model");
4: const { RulesModelDef, ConsentModelDef } = require("./Rules.model");
5: const { canonicalGrade } = require("../../utils/grades");
6: const { StudentModelDef } = require("../Student/Student.model");
7: const { handleUpload } = require("../UploadFile/file");
8: const { passportPhotoJob } = require("../../services/passportPhotoJob");
9: const { logWithSource } = require("../../middleware/logger");
10: const { isValidIsraeliId } = require("../../utils/israeliId");
11: const { notifyChange } = require("../../services/liveHub");
12: const { isDuplicateKey } = require("../../utils/tzUnique");
13:
14: // One fixed parent-registration link. Its secret changes only when an admin
15: // rotates it. Parents' requests join the waiting list (status "ينتظر") and
16: // never become students without staff approval.
17: const LINK_KEY = "parent-registration";
18: const MONTHLY_LIMIT = 30;
19: const DAY_MS = 24 * 60 * 60 * 1000;
20: const PARENT_SOURCE = "اهل";
21: const PENDING_STATUS = "ينتظر";
22: const RECEIVED_MESSAGE = "تم استلام الطلب، سنتواصل معكم قريبًا";
23:
24: /* ================= helpers ================= */
25:
26: function toDate(value) {
27:   if (!value) return null;
28:   if (value instanceof Date) return value;
29:   if (typeof value === "number") return new Date(value);
30:
31:   if (typeof value === "string") {
32:     const s = value.trim();
33:
34:     let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
35:     if (m) {
36:       const [, dd, mm, yyyy] = m.map(Number);
37:       return new Date(Date.UTC(yyyy, mm - 1, dd));
38:     }
39:
40:     m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
41:     if (m) {
42:       const [, yyyy, mm, dd] = m.map(Number);
43:       return new Date(Date.UTC(yyyy, mm - 1, dd));
44:     }
45:
46:     const ts = Date.parse(s);
47:     if (!Number.isNaN(ts)) return new Date(ts);
48:   }
49:
50:   return null;
51: }
52:
53: const resultsOf = (res) => (res?.success && Array.isArray(res.result) ? res.result : []);
54:
55: async function getLinkToken() {
56:   const [link] = resultsOf(await InviteTokenModelDef.get({ key: LINK_KEY }));
57:   return link?.token || null;
58: }
59:
60: async function saveNewToken() {
61:   const token = crypto.randomBytes(18).toString("base64url");
62:   await InviteTokenModelDef.update({ key: LINK_KEY }, { key: LINK_KEY, token });
63:   return token;
64: }
65:
66: async function isCurrentToken(candidate) {
67:   const expected = await getLinkToken();
68:   if (!candidate || !expected) return false;
69:   const a = Buffer.from(String(candidate));
70:   const b = Buffer.from(String(expected));
71:   return a.length === b.length && crypto.timingSafeEqual(a, b);
72: }
73:
74: // Parent requests created in the last 30 days, from any address, whatever their status now.
75: // Rejected (deleted) requests no longer count, so removing spam frees room.
76: async function countRecentParentRequests() {
77:   const since = Date.now() - 30 * DAY_MS;
78:   return resultsOf(await StudentModelDef.get({ source: PARENT_SOURCE }))
79:     .filter((student) => new Date(student.createdAt).getTime() >= since).length;
80: }
81:
82: /* ================= the rules and the parent's signature ================= */
83:
84: const SIGNATURE = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
85: const MAX_SIGNATURE = 300 * 1024;
86: const PNG_START = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
87: const MIN_PNG_BYTES = 67;
88: const isPng = (dataAddress) => {
89:   const bytes = Buffer.from(dataAddress.slice(dataAddress.indexOf(",") + 1), "base64");
90:   return bytes.length >= MIN_PNG_BYTES && bytes.subarray(0, PNG_START.length).equals(PNG_START);
91: };
92: const MAX_RULES = 20000;
93:
94: async function currentRules() {
95:   const rows = resultsOf(await RulesModelDef.get({}));
96:   return rows.reduce((latest, row) => (!latest || row.version > latest.version ? row : latest), { version: 0, text: DEFAULT_RULES });
97: }
98:
99: // What the form sent about the rules; "" when all is in order.
100: function consentProblem(body, rules, { allowPending = false } = {}) {
101:   if (String(body.rulesVersion ?? "") !== String(rules.version)) return { status: 409, code: "RULES_CHANGED", message: "تم تحديث نظام الجمعية. يُرجى قراءته والتوقيع عليه من جديد." };
102:   const signature = String(body.signature ?? "");
103:   if (body.rulesAccepted !== "true" || !cleanText(body.signerName, 100) || (!signature && !allowPending) || (signature && (signature.length > MAX_SIGNATURE || !SIGNATURE.test(signature) || !isPng(signature)))) {
104:     return { status: 400, code: "CONSENT_REQUIRED", message: "يجب الموافقة على قوانين الجمعية وكتابة اسم ولي الأمر، وإضافة توقيع/ختم صالح أو استكماله لاحقًا." };
105:   }
106:   return null;
107: }
108:
109: const getRules = async (req, res) => {
110:   try {
111:     const rules = await currentRules();
112:     return res.status(200).json({ ok: true, rules: rules ? { version: rules.version, text: rules.text } : null });
113:   } catch (err) {
114:     logWithSource("InviteToken.getRules", err);
115:     return res.status(500).json({ ok: false, message: "تعذّر تحميل نظام الجمعية" });
116:   }
117: };
118:
119: const publishRules = async (req, res) => {
120:   try {
121:     const text = String(req.body?.text ?? "").trim();
122:     if (text.length > MAX_RULES) return res.status(400).json({ ok: false, message: "النص طويل جدًا" });
123:     const latest = await currentRules();
124:     const version = (latest?.version || 0) + 1;
125:     const createdByName = String(req.actor?.name || "");
126:     await RulesModelDef.create({ version, text, createdAt: new Date(), createdByName });
127:     return res.status(200).json({ ok: true, rules: { version, text } });
128:   } catch (err) {
129:     if (isDuplicateKey(err)) return res.status(409).json({ ok: false, message: "نشر شخص آخر النظام الآن. حدّث الصفحة وحاول مرة أخرى." });
130:     logWithSource("InviteToken.publishRules", err);
131:     return res.status(500).json({ ok: false, message: "تعذّر نشر نظام الجمعية" });
132:   }
133: };
134:
135: const getConsent = async (req, res) => {
136:   try {
137:     const [consent] = resultsOf(await ConsentModelDef.get({ studentId: String(req.params.studentId) }));
138:     if (!consent) return res.status(200).json({ ok: true, consent: null });
139:     if (!resultsOf(await StudentModelDef.get({ _id: String(req.params.studentId) })).length) return res.status(200).json({ ok: true, consent: null });
140:     const rows = resultsOf(await RulesModelDef.get({ version: consent.rulesVersion }));
141:     return res.status(200).json({
142:       ok: true,
143:       consent: {
144:         signerName: consent.signerName,
145:         signature: consent.signature,
146:         signedAt: consent.signedAt,
147:         acceptedAt: consent.acceptedAt || consent.signedAt,
148:         signaturePending: !consent.signature,
149:         rulesVersion: consent.rulesVersion,
150:         rulesText: rows[0]?.text ?? (consent.rulesVersion === 0 ? DEFAULT_RULES : ""),
151:       },
152:     });
153:   } catch (err) {
154:     logWithSource("InviteToken.getConsent", err);
155:     return res.status(500).json({ ok: false, message: "تعذّر تحميل التوقيع" });
156:   }
157: };
158:
159: // A student the association added: the parent signs later, on the student's page.
160: const signConsent = async (req, res) => {
161:   try {
162:     const studentId = String(req.params.studentId);
163:     const [student] = resultsOf(await StudentModelDef.get({ _id: studentId }));
164:     if (!student) return res.status(404).json({ ok: false, message: "الطالب غير موجود" });
165:     const rules = await currentRules();
166:     if (!rules?.text) return res.status(409).json({ ok: false, code: "NO_RULES", message: "يجب نشر نظام الجمعية أولًا." });
167:     const problem = consentProblem(req.body, rules);
168:     if (problem) return res.status(problem.status).json({ ok: false, code: problem.code, message: problem.message });
169:     const [existing] = resultsOf(await ConsentModelDef.get({ studentId }));
170:     if (existing?.signature && student.consentAt) {
171:       return res.status(409).json({ ok: false, code: "ALREADY_SIGNED", message: "يوجد توقيع لهذا الطالب." });
172:     }
173:     // A prior consent write may have succeeded before the student marker failed.
174:     // Repair that marker on retry without replacing the original evidence.
175:     const signedAt = existing?.signature ? existing.signedAt : new Date();
176:     if (!existing?.signature) {
177:       const evidence = {
178:         studentId, tz: student.tz, rulesVersion: rules.version,
179:         signerName: cleanText(req.body.signerName, 100), signature: String(req.body.signature),
180:         acceptedAt: signedAt, signedAt, recordedBy: String(req.actor?.name || ""),
181:       };
182:       if (existing) {
183:         const saved = await ConsentModelDef.updateExisting(
184:           { _id: String(existing._id), signature: existing.signature ?? null }, evidence,
185:         );
186:         if (!saved?.result) return res.status(409).json({ ok: false, code: "CONSENT_CHANGED", message: "تم تحديث التوقيع. حدّث الصفحة وحاول مرة أخرى." });
187:       } else await ConsentModelDef.create(evidence);
188:     }
189:     const marked = await StudentModelDef.updateExisting({ _id: studentId }, { consentAt: signedAt });
190:     if (!marked?.result) throw new Error("Student disappeared while saving consent");
191:     notifyChange("student", studentId);
192:     return res.status(200).json({ ok: true });
193:   } catch (err) {
194:     if (isDuplicateKey(err)) return res.status(409).json({ ok: false, code: "CONSENT_CHANGED", message: "تم تحديث التوقيع. حدّث الصفحة وحاول مرة أخرى." });
195:     logWithSource("InviteToken.signConsent", err);
196:     return res.status(500).json({ ok: false, message: "تعذّر حفظ التوقيع" });
197:   }
198: };
199:
200: /* ================= admin: the link ================= */
201:
202: const getLink = async (req, res) => {
203:   try {
204:     const token = (await getLinkToken()) || (await saveNewToken());
205:     return res.status(200).json({
206:       ok: true,
207:       token,
208:       usedThisMonth: await countRecentParentRequests(),
209:       monthlyLimit: MONTHLY_LIMIT,
210:     });
211:   } catch (err) {
212:     logWithSource("InviteToken.getLink", err);
213:     return res.status(500).json({ ok: false, message: "تعذّر تحميل رابط التسجيل" });
214:   }
215: };
216:
217: const rotateLink = async (req, res) => {
218:   try {
219:     return res.status(200).json({ ok: true, token: await saveNewToken() });
220:   } catch (err) {
221:     logWithSource("InviteToken.rotateLink", err);
222:     return res.status(500).json({ ok: false, message: "تعذّر تغيير الرابط" });
223:   }
224: };
225:
226: /* ================= public: the parents' form ================= */
227:
228: const validateToken = async (req, res) => {
229:   try {
230:     if (!(await isCurrentToken(req.params.token))) {
231:       return res.status(404).json({ valid: false });
232:     }
233:     const rules = await currentRules();
234:     return res.status(200).json({
235:       valid: true,
236:       // Version 0 is the built-in default; a deliberately empty published version closes intake.
237:       open: Boolean(rules?.text) && (await countRecentParentRequests()) < MONTHLY_LIMIT,
238:       ...(rules?.text ? { rules: { version: rules.version, text: rules.text } } : { noRules: true }),
239:     });
240:   } catch (err) {
241:     logWithSource("InviteToken.validateToken", err);
242:     return res.status(500).json({ valid: false, message: "تعذّر التحقق من الرابط" });
243:   }
244: };
245:
246: const SHORT_FIELDS = [
247:   "firstname", "lastname", "gender", "phone", "email", "city", "street",
248:   "father_name", "mother_name", "father_phone", "mother_phone",
249:   "father_work", "mother_work", "school", "layer",
250: ];
251: const LONG_FIELDS = ["health_status", "notes"];
252:
253: const cleanText = (value, max) => String(value ?? "").trim().slice(0, max);
254:
255: // Only these fields are read from the public form; status, source,
256: // main_teacher and photo are always set by the server.
257: function readRegistration(body = {}) {
258:   const fields = { tz: String(body.tz ?? "").trim() };
259:   for (const name of SHORT_FIELDS) fields[name] = cleanText(body[name], 100);
260:   for (const name of LONG_FIELDS) fields[name] = cleanText(body[name], 1000);
261:   fields.birth_date = toDate(cleanText(body.birth_date, 40));
262:   if (!fields.health_status) fields.health_status = "سليم";
263:   fields.layer = canonicalGrade(fields.layer);
264:   return fields;
265: }
266:
267: function registrationError(fields) {
268:   if (!isValidIsraeliId(fields.tz)) return "رقم الهوية غير صالح";
269:   if (!fields.firstname || !fields.lastname) return "اسم الطالب واسم العائلة مطلوبان";
270:   return "";
271: }
272:
273: async function savePhoto(tz, file, id) {
274:   try {
275:     const uploaded = await handleUpload(
276:       file,
277:       StudentModelDef.dbName,
278:       StudentModelDef.collections.active,
279:       tz
280:     );
281:     if (uploaded?.secure_url) {
282:       await StudentModelDef.update({ tz }, { photo: uploaded.secure_url });
283:       if (id) notifyChange("student", id);
284:       passportPhotoJob.schedule(uploaded.secure_url);
285:     }
286:   } catch (err) {
287:     logWithSource("InviteToken.savePhoto", err);
288:   }
289: }
290:
291: const submitRegistration = async (req, res) => {
292:   try {
293:     if (!(await isCurrentToken(req.params.token))) {
294:       return res.status(404).json({
295:         ok: false,
296:         valid: false,
297:         message: "الرابط غير صالح. يُرجى طلب رابط جديد من الجمعية.",
298:       });
299:     }
300:
301:     if ((await countRecentParentRequests()) >= MONTHLY_LIMIT) {
302:       return res.status(429).json({
303:         ok: false,
304:         code: "INTAKE_CLOSED",
305:         message: "استقبال الطلبات متوقف مؤقتًا. يُرجى المحاولة بعد بضعة أيام.",
306:       });
307:     }
308:
309:     const fields = readRegistration(req.body);
310:     const error = registrationError(fields);
311:     if (error) {
312:       return res.status(400).json({ ok: false, message: error });
313:     }
314:
315:     // Checked before the ID, so the answer says nothing about who is registered.
316:     const rules = await currentRules();
317:     if (!rules?.text) {
318:       return res.status(409).json({ ok: false, code: "NO_RULES", message: "لا يمكن استقبال الطلبات قبل نشر نظام الجمعية. يُرجى التواصل مع الجمعية." });
319:     }
320:     const problem = consentProblem(req.body, rules, { allowPending: true });
321:     if (problem) return res.status(problem.status).json({ ok: false, code: problem.code, message: problem.message });
322:
323:     // A known ID gets exactly the same reply as a new one, so the public form
324:     // cannot reveal who is registered.
325:     const [existing] = resultsOf(await StudentModelDef.get({ tz: fields.tz }));
326:     if (existing) {
327:       // Registered or waiting: the same reply, and nothing is saved (owner, 2026-11-05).
328:       return res.status(200).json({ ok: true, message: RECEIVED_MESSAGE });
329:     }
330:
331:     const now = new Date();
332:     const created = await StudentModelDef.create({
333:       ...fields,
334:       photo: "",
335:       main_teacher: null,
336:       source: PARENT_SOURCE,
337:       status: PENDING_STATUS,
338:       consentAt: req.body.signature ? now : null,
339:       createdAt: now,
340:       updatedAt: now,
341:     });
342:     // Agreement is saved before replying; an absent stamp remains pending.
343:     // The time is the server's, and a known ID never reaches this point.
344:     try {
345:       await ConsentModelDef.create({
346:         studentId: String(created?.result?._id),
347:         tz: fields.tz,
348:         rulesVersion: rules.version,
349:         signerName: cleanText(req.body.signerName, 100),
350:         signature: req.body.signature ? String(req.body.signature) : null,
351:         acceptedAt: now,
352:         signedAt: req.body.signature ? now : null,
353:       });
354:     } catch (consentError) {
355:       await StudentModelDef.delete({ _id: String(created?.result?._id) });
356:       throw consentError;
357:     }
358:     res.status(200).json({ ok: true, message: RECEIVED_MESSAGE });
359:     // Announced after replying, like the alert below: open staff lists reload.
360:     const createdId = created?.result?._id ? String(created.result._id) : null;
361:     if (createdId) notifyChange("student", createdId);
362:     // Fire-and-forget, after replying: the alert never delays or changes the
363:     // answer (and so cannot tell a new ID from a known one by its timing).
364:     Promise.resolve()
365:       .then(() => require("../../services/alertEvents").parentRegistered({
366:         _id: created?.result?._id ? String(created.result._id) : null,
367:         firstname: fields.firstname,
368:         lastname: fields.lastname,
369:       }))
370:       .catch((alertError) => logWithSource("InviteToken.alert", alertError));
371:
372:     // Uploaded after replying: the reply must not wait on (or mention) Drive,
373:     // or its timing would tell a new ID from a known one.
374:     if (req.file) {
375:       await savePhoto(fields.tz, req.file, createdId);
376:     }
377:   } catch (err) {
378:     // The same ID was sent twice at once: the second gets the known-ID reply.
379:     if (isDuplicateKey(err) && !res.headersSent) return res.status(200).json({ ok: true, message: RECEIVED_MESSAGE });
380:     logWithSource("InviteToken.submitRegistration", err);
381:     if (!res.headersSent) {
382:       return res.status(500).json({ ok: false, message: "تعذّر إرسال الطلب. يُرجى المحاولة لاحقًا." });
383:     }
384:   }
385: };
386:
387: module.exports = {
388:   getLink,
389:   rotateLink,
390:   validateToken,
391:   submitRegistration,
392:   getRules,
393:   publishRules,
394:   getConsent,
395:   signConsent,
396: };
397:

SOURCE server/Entities/InviteToken/Rules.model.js lines 1-51
1: const api = require("../api");
2:
3: const dbName = process.env.DB_NAME || "tamheed_db";
4:
5: // The association's rules. A new text is a new row: a signed version never changes.
6: //   { version, text, createdAt, createdByName }
7: const RulesModelDef = { dbName, collection: "AssociationRules" };
8: RulesModelDef.get = async function (filter = {}) {
9:   return await api.read({ dbName: this.dbName, collection: this.collection, filter });
10: };
11: RulesModelDef.create = async function (data) {
12:   return await api.create({ dbName: this.dbName, collection: this.collection, data });
13: };
14:
15: // A parent's signature on a version of the rules, apart from the student so no
16: // list ever carries it, and only the rules' editors can read it.
17: //   { studentId, tz, rulesVersion, signerName, signature, signedAt }
18: const ConsentModelDef = { dbName, collection: "StudentConsents" };
19: ConsentModelDef.get = async function (filter = {}) {
20:   return await api.read({ dbName: this.dbName, collection: this.collection, filter });
21: };
22: ConsentModelDef.create = async function (data) {
23:   await ensureConsentIndexes();
24:   return await api.create({ dbName: this.dbName, collection: this.collection, data });
25: };
26: ConsentModelDef.updateExisting = async function (filter, newData) {
27:   return await api.updateExisting({ dbName: this.dbName, collection: this.collection, filter, newData });
28: };
29: ConsentModelDef.delete = async function (filter) {
30:   return await api.delete({ dbName: this.dbName, collection: this.collection, filter });
31: };
32:
33: // Two publishes at once cannot both take the same version.
34: const RULES_INDEXES = [{ key: { version: 1 }, options: { unique: true } }];
35: const CONSENT_INDEXES = [{ key: { studentId: 1 }, options: { unique: true } }];
36: let consentIndexReady;
37: function ensureConsentIndexes() {
38:   if (!consentIndexReady) {
39:     const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");
40:     consentIndexReady = ensureIndexes(collectionOf(ConsentModelDef), CONSENT_INDEXES)
41:       .catch((error) => { consentIndexReady = null; throw error; });
42:   }
43:   return consentIndexReady;
44: }
45: async function ensureRulesIndexes() {
46:   const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");
47:   await ensureIndexes(collectionOf(RulesModelDef), RULES_INDEXES);
48: }
49:
50: module.exports = { RulesModelDef, ConsentModelDef, RULES_INDEXES, CONSENT_INDEXES, ensureRulesIndexes, ensureConsentIndexes };
51:

SOURCE server/Entities/Student/Student.controller.js lines 1-46
1: const { StudentModelDef } = require("./Student.model");
2: const { logWithSource } = require("../../middleware/logger");
3: const { handleUpload, handleDeleteByUrl } = require("../UploadFile/file");
4: const { audit } = require("../../utils/audit");
5: const { LessonModelDef } = require("../Lesson/Lesson.model");
6: const { UserModelDef } = require("../User/User.model");
7: const { isSystemTz, can, isHiddenUser } = require("../../utils/permissions");
8: const { createStudentScope } = require("../../utils/studentScope");
9: const { contactById } = require("../../utils/guideContact");
10: const { isResponsible, ownLessons, seesAllLessons } = require("../../utils/lessonAccess");
11: const { AttendanceModelDef } = require("../Attendance/Attendance.model");
12: // The student page's attendance: every date (dateKey is yyyymmdd), newest 200 rows.
13: const LAST_DATE_KEY = 99991231;
14: const ATTENDANCE_ROWS = 200;
15: const { checkVersion, editorStamp, sameVersion, raceLost } = require("../../middleware/lockGuard");
16: const { isDuplicateKey } = require("../../utils/tzUnique");
17: const { notifyChange, liveHub } = require("../../services/liveHub");
18: const { playerPhotoJob } = require("../../services/playerPhotoJob");
19: const { passportPhotoJob } = require("../../services/passportPhotoJob");
20:
21: // Who the actor may see: null (students.viewAll) or a Set of student _ids.
22: const scope = createStudentScope({ lessonModel: LessonModelDef, studentModel: StudentModelDef });
23: const inScope = (visible, student) => !visible || visible.has(String(student?._id));
24: // A hidden student gets the same answer as a missing one (existence is not revealed).
25: const NOT_FOUND = { ok: false, message: "Student not found" };
26:
27: // main_teacher (the responsible guide) names a user by _id: an active (approved) account that
28: // is not the system account. Only a 24-hex ObjectId is looked up.
29: const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
30: async function isValidInstructor(id) {
31:   if (typeof id !== "string" || !OBJECT_ID.test(id)) return false;
32:   const found = await UserModelDef.get({ _id: id }, "active");
33:   const user = found?.result?.[0];
34:   return Boolean(user) && !isHiddenUser(user);
35: }
36: const INVALID_INSTRUCTOR = { ok: false, code: "INVALID_INSTRUCTOR", message: "المرشد المسؤول غير موجود" };
37: const hasValue = (v) => v !== undefined && v !== null && v !== "";
38: // Only a students.viewAll holder sets or changes main_teacher; for
39: // anyone else the field is ignored (not validated, not written).
40: const mayAssignInstructor = (actor) => can(actor, "students.viewAll");
41: const WAITING_STATUS = "ينتظر";
42: const GUIDE_REQUIRED = { ok: false, code: "GUIDE_REQUIRED", message: "يجب اختيار المرشد المسؤول." };
43: // A guide's educational lesson follows his students (services/educationalLesson). Never fatal.
44: const moveInEducationalLesson = (studentId, from, to) => Promise.resolve()
45:   .then(() => require("../../services/educationalLesson").educationalLessons().moveStudent(String(studentId), from, to))
46:   .catch((err) => logWithSource("Student.moveInEducationalLesson", err));

SOURCE server/Entities/Student/Student.controller.js lines 238-416
238: // POST /api/students
239: const postS = async (req, res) => {
240:   let releasePrograms = async () => {};
241:   try {
242:     const model = buildData(req.body);
243:     const assigns = mayAssignInstructor(req.actor);
244:     // A creator without students.viewAll becomes the responsible guide, so he
245:     // keeps seeing the student he just added.
246:     if (!assigns) model.main_teacher = req.actor?.id != null ? String(req.actor.id) : null;
247:
248:     if (!model.tz) {
249:       return res.status(400).json({
250:         ok: false,
251:         message: "tz required",
252:       });
253:     }
254:
255:     if (!model.firstname || !model.lastname) {
256:       return res.status(400).json({
257:         ok: false,
258:         message: "firstname/lastname required",
259:       });
260:     }
261:
262:     if (assigns && hasValue(req.body?.main_teacher) && !(await isValidInstructor(req.body.main_teacher))) {
263:       return res.status(400).json(INVALID_INSTRUCTOR);
264:     }
265:
266:     if (assigns && !hasValue(model.main_teacher) && model.status !== WAITING_STATUS) {
267:       return res.status(400).json(GUIDE_REQUIRED);
268:     }
269:
270:     const exists = await StudentModelDef.get({ tz: model.tz });
271:     if (exists?.result?.length) {
272:       return res.status(409).json({
273:         ok: false,
274:         message: "الطالب مسجّل مسبقًا",
275:       });
276:     }
277:
278:     if (model.main_teacher && model.status !== WAITING_STATUS) {
279:       releasePrograms = await require("../../services/educationalLesson").educationalLessons().holdForStudentChange(null, model.main_teacher, req);
280:     }
281:     const created = await StudentModelDef.create({
282:       ...model,
283:       createdAt: new Date(),
284:     });
285:     await recordStudent(req, "create", null, created?.result || model);
286:     notifyChange("student", created?.result?._id);
287:     if (model.main_teacher && model.status !== WAITING_STATUS) await moveInEducationalLesson(created?.result?._id, null, model.main_teacher);
288:
289:     await safeNotify({
290:       toRoles: ["ادارة"],
291:       module: "STUDENTS",
292:       action: "CREATED",
293:       title: "تم إضافة طالب جديد",
294:       message: `تم إنشاء طالب: ${model.firstname} ${model.lastname} (${model.tz})`,
295:       meta: { tz: model.tz },
296:       createdBy: req.user?._id || null,
297:     });
298:
299:     return res.status(201).json({
300:       ok: true,
301:       created,
302:     });
303:   } catch (err) {
304:     if (err.status === 423) return res.status(423).json({ ok: false, code: "LOCKED", holder: err.holder, message: err.message });
305:     // The unique tz index refused a save of the same moment (utils/tzUnique).
306:     if (isDuplicateKey(err)) return res.status(409).json({ ok: false, code: "TZ_EXISTS", message: "الطالب مسجّل مسبقًا" });
307:     logWithSource("Student.postS", err);
308:     return res.status(500).json({
309:       ok: false,
310:       message: err.message,
311:     });
312:   } finally { await releasePrograms(); }
313: };
314:
315: // PUT /api/students/:tz
316: const putS = async (req, res) => {
317:   let releasePrograms = async () => {};
318:   try {
319:     const tz = String(req.params.tz ?? "").trim();
320:
321:     if (!tz) {
322:       return res.status(400).json({
323:         ok: false,
324:         message: "tz required",
325:       });
326:     }
327:
328:     const existing = await StudentModelDef.get({ tz });
329:     const visible = await scope.visibleStudentIds(req.actor);
330:     if (!existing?.result?.length || !inScope(visible, existing.result[0])) {
331:       return res.status(404).json(NOT_FOUND);
332:     }
333:
334:     const assigns = mayAssignInstructor(req.actor);
335:     // Validated only when it changes: an unchanged stale value (inactive guide,
336:     // legacy id) must not block saving the other fields.
337:     const body = req.body || {};
338:     const changesInstructor = String(body.main_teacher ?? "") !== String(existing.result[0].main_teacher ?? "");
339:     if (assigns && changesInstructor && hasValue(body.main_teacher) && !(await isValidInstructor(body.main_teacher))) {
340:       return res.status(400).json(INVALID_INSTRUCTOR);
341:     }
342:
343:     const newData = removeEmpty(buildData(req.body));
344:     // buildData's default is for a new student: a parent's request stays a parent's after approval.
345:     if (!hasValue(req.body?.source)) delete newData.source;
346:     if (!assigns) delete newData.main_teacher;
347:     // An explicit empty value from a viewAll holder clears the responsible guide.
348:     else if (req.body && Object.hasOwn(req.body, "main_teacher") && !hasValue(req.body.main_teacher)) newData.main_teacher = null;
349:
350:     // A tz change may not take another student's ID number.
351:     if (newData.tz !== undefined && String(newData.tz).trim() !== tz) {
352:       const taken = await StudentModelDef.get({ tz: String(newData.tz).trim() });
353:       const own = String(existing.result[0]._id);
354:       if ((taken?.result || []).some((s) => String(s._id) !== own)) {
355:         return res.status(409).json({ ok: false, code: "TZ_EXISTS", message: "الطالب مسجّل مسبقًا" });
356:       }
357:     }
358:
359:     // Approving a request names its responsible guide; one who may not name a guide takes it himself.
360:     const before = existing.result[0];
361:     const approving = before.status === WAITING_STATUS && hasValue(body.status) && body.status !== WAITING_STATUS;
362:     if (approving && !hasValue(newData.main_teacher ?? before.main_teacher)) {
363:       if (assigns || req.actor?.id == null) return res.status(400).json(GUIDE_REQUIRED);
364:       newData.main_teacher = String(req.actor.id);
365:     }
366:
367:     const stale = checkVersion(existing.result[0], req);
368:     if (stale) return res.status(409).json(stale);
369:     newData.updatedAt = new Date();
370:     Object.assign(newData, editorStamp(req));
371:     const guideNow = "main_teacher" in newData ? newData.main_teacher : before.main_teacher;
372:     const statusNow = newData.status ?? before.status;
373:     const movesProgram = statusNow !== WAITING_STATUS && (approving || String(guideNow ?? "") !== String(before.main_teacher ?? ""));
374:     if (movesProgram) releasePrograms = await require("../../services/educationalLesson").educationalLessons().holdForStudentChange(before.main_teacher, guideNow, req);
375:     // Written only if nobody saved since the student was read.
376:     const studentId = String(existing.result[0]._id);
377:     const updated = await StudentModelDef.updateExisting(
378:       sameVersion({ _id: studentId }, existing.result[0]),
379:       newData
380:     );
381:     if (!updated?.result) return res.status(409).json(await raceLost(() => StudentModelDef.get({ _id: studentId })));
382:     await recordStudent(req, "update", existing.result[0], { ...existing.result[0], ...newData });
383:     notifyChange("student", existing.result[0]._id);
384:     if (movesProgram) {
385:       await moveInEducationalLesson(before._id, before.main_teacher, guideNow);
386:     }
387:     // A football player's name or photo shows on his own sport screen (a no-op when nobody listens).
388:     liveHub.toStudents([existing.result[0]._id], "me");
389:     if ("photo" in newData) {
390:       playerPhotoJob.schedule(studentId);
391:       passportPhotoJob.schedule(newData.photo);
392:     }
393:
394:     await safeNotify({
395:       toRoles: ["ادارة"],
396:       module: "STUDENTS",
397:       action: "UPDATED",
398:       title: "تم تعديل طالب",
399:       message: `تم تعديل بيانات الطالب (${tz})`,
400:       meta: { tz },
401:       createdBy: req.user?._id || null,
402:     });
403:
404:     return res.status(200).json({
405:       ok: true,
406:       updated,
407:     });
408:   } catch (err) {
409:     if (err.status === 423) return res.status(423).json({ ok: false, code: "LOCKED", holder: err.holder, message: err.message });
410:     if (isDuplicateKey(err)) return res.status(409).json({ ok: false, code: "TZ_EXISTS", message: "الطالب مسجّل مسبقًا" });
411:     logWithSource("Student.putS", err);
412:     return res.status(500).json({
413:       ok: false,
414:       message: err.message,
415:     });
416:   } finally { await releasePrograms(); }

SOURCE server/middleware/lockGuard.js lines 100-151
100: // The 409 body when a guarded write matched nothing: the record changed (or
101: // was removed) after it was read. `reread` returns the model's { result: [...] }.
102: async function raceLost(reread, view = (doc) => doc) {
103:   const fresh = (await reread().catch(() => null))?.result?.[0] || null;
104:   return staleAnswer(fresh, view);
105: }
106:
107: let defaultLocks = null;
108: const lazyLocks = () => {
109:   if (!defaultLocks) {
110:     const { createLocks } = require("../services/locks");
111:     defaultLocks = createLocks({
112:       model: require("../Entities/Lock/Lock.model").LockModelDef,
113:       hub: require("../services/liveHub").liveHub,
114:     });
115:   }
116:   return defaultLocks;
117: };
118:
119: const guard = createLockGuard({
120:   locks: lazyLocks,
121:   logError: (source, error) => require("./logger").logWithSource(source, error),
122: });
123:
124: // Who holds `key`, unless it is free or held by this tab (clientId): for a
125: // controller that also writes items other than its route's own (a player
126: // save changes the rosters of sport lessons). lockedAnswer is the 423 body.
127: const holderOf = (key, clientId) => lazyLocks().holderOf(key, clientId ?? null);
128: const lockedAnswer = (holder) => ({ ok: false, code: "LOCKED", holder, message: lockedMessage(holder) });
129:
130: // Hold all affected programs before changing a student's responsible guide.
131: // Sorting avoids lock-order inversions; preserve a lock already held by this tab.
132: async function holdItemLocks(locks, keys, req) {
133:   const clientId = req.get?.("X-Client-Id") || require("crypto").randomUUID();
134:   const release = [];
135:   const owner = { clientId, userId: req.actor?.id, ...lockOwner(req.actor) };
136:   const done = async () => {
137:     for (const key of release.reverse()) await locks.release(key, clientId).catch(() => {});
138:   };
139:   try {
140:     for (const key of [...new Set(keys)].sort()) {
141:       const result = await locks.acquire(key, owner);
142:       if (!result.ok) throw Object.assign(new Error(lockedMessage(result.holder)), { status: 423, holder: result.holder });
143:       if (result.created !== false) release.push(key);
144:     }
145:     return done;
146:   } catch (error) { await done(); throw error; }
147: }
148: const acquireItemLocks = (keys, req) => holdItemLocks(lazyLocks(), keys, req);
149:
150: module.exports = { ...guard, lockOwner, holderOf, lockedAnswer, holdItemLocks, acquireItemLocks, checkVersion, sameVersion, nextStamp, raceLost, staleAnswer, editorStamp, createLockGuard, LOCKED_MESSAGE, lockedMessage, staleMessage };
151:

SOURCE server/services/educationalLesson.js lines 1-75
1: // A responsible guide's educational lesson holds all of that guide's students
2: // (owner, 2026-11-05): a student joins on approval or when added, and moves when the
3: // guide changes. A waiting request is not a student yet.
4: const KIND = "educational";
5: const PENDING = "ينتظر";
6:
7: const rows = (res) => (Array.isArray(res?.result) ? res.result : []);
8: const same = (a, b) => String(a) === String(b);
9:
10: function createEducationalLessons({ lessons, students, now = () => new Date(), lockPrograms = async () => async () => {}, changed = () => {} }) {
11:   const lessonOf = async (teacher) => (teacher ? rows(await lessons.get({ teacher: String(teacher), kind: KIND }))[0] || null : null);
12:
13:   // Retry a roster delta against the latest snapshot. Never replace a roster
14:   // another write changed while this request was awaiting the database.
15:   async function change(lesson, delta) {
16:     for (let attempt = 0; attempt < 8 && lesson; attempt += 1) {
17:       const list = lesson.list_students || [];
18:       const next = delta(list);
19:       if (next.length === list.length && next.every((id, i) => same(id, list[i]))) return 0;
20:       const before = lesson.updatedAt;
21:       const updatedAt = new Date(Math.max(now().getTime(), (new Date(before || 0).getTime() || 0) + 1));
22:       const saved = await lessons.updateExisting(
23:         { _id: String(lesson._id), updatedAt: before ?? null }, { list_students: next, updatedAt },
24:       );
25:       if (saved?.result) { changed(String(lesson._id)); return next.length - list.length; }
26:       lesson = rows(await lessons.get({ _id: String(lesson._id) }))[0];
27:     }
28:     throw new Error("Educational program changed repeatedly; enrolment could not be saved");
29:   }
30:
31:   async function holdForStudentChange(from, to, req) {
32:     const programs = await Promise.all([lessonOf(from), lessonOf(to)]);
33:     return lockPrograms(programs.filter(Boolean).map((lesson) => `lesson:${lesson._id}`), req);
34:   }
35:
36:   // Puts every student of this guide on the lesson. Returns how many joined.
37:   async function enrolAll(teacher) {
38:     const lesson = await lessonOf(teacher);
39:     if (!lesson) return 0;
40:     const own = rows(await students.get({ main_teacher: String(teacher) })).filter((s) => s.status !== PENDING);
41:     return change(lesson, (list) => [...new Set([...list.map(String), ...own.map((s) => String(s._id))])]);
42:   }
43:
44:   // After a student's guide changed, or a request was approved.
45:   async function moveStudent(studentId, fromTeacher, toTeacher) {
46:     if (fromTeacher && !same(fromTeacher, toTeacher ?? "")) {
47:       const old = await lessonOf(fromTeacher);
48:       if (old && (old.list_students || []).some((x) => same(x, studentId))) {
49:         await change(old, (list) => list.filter((x) => !same(x, studentId)));
50:       }
51:     }
52:     const next = await lessonOf(toTeacher);
53:     if (next && !(next.list_students || []).some((x) => same(x, studentId))) {
54:       await change(next, (list) => list.some((x) => same(x, studentId)) ? list : [...list, String(studentId)]);
55:     }
56:   }
57:
58:   // Taken by another lesson of the same guide? A guide has one for now.
59:   async function takenBy(teacher, ignoreId = null) {
60:     const lesson = await lessonOf(teacher);
61:     return lesson && !same(lesson._id, ignoreId ?? "") ? lesson : null;
62:   }
63:
64:   return { enrolAll, moveStudent, takenBy, holdForStudentChange };
65: }
66:
67: const educationalLessons = () => createEducationalLessons({
68:   lessons: require("../Entities/Lesson/Lesson.model").LessonModelDef,
69:   students: require("../Entities/Student/Student.model").StudentModelDef,
70:   lockPrograms: require("../middleware/lockGuard").acquireItemLocks,
71:   changed: (id) => require("./liveHub").notifyChange("lesson", id),
72: });
73:
74: module.exports = { createEducationalLessons, educationalLessons, KIND };
75:

SOURCE server/Entities/Lesson/Lesson.controller.js lines 395-422
395:     if (next.kind === "educational" && (await edu().takenBy(next.teacher, id))) return res.status(409).json(EDUCATIONAL_TAKEN);
396:
397:     const sameDay = await LessonModelDef.get({ "date.day": next.date.day });
398:     const sportDay = await SportLessonModelDef.get({ "date.day": next.date.day });
399:
400:     const conflict = conflictsInRoom9(next, {
401:       lessons: sameDay?.result || [],
402:       sportLessons: sportDay?.result || [],
403:       ignoreId: id,
404:     });
405:
406:     if (conflict) {
407:       return res.status(409).json({ ok: false, message: "يوجد تعارض" });
408:     }
409:
410:     // Written only if nobody saved since `current` was read.
411:     const updated = await LessonModelDef.updateExisting(
412:       sameVersion({ _id: id }, current),
413:       { ...next, updatedAt: nextStamp(current), ...editorStamp(req) }
414:     );
415:     if (!updated?.result) {
416:       return res.status(409).json(await raceLost(() => LessonModelDef.get({ _id: id }), (doc) => scopeLesson(doc, visible)));
417:     }
418:     await recordLesson(req, "update", current, { ...current, ...next });
419:     notifyChange("lesson", id);
420:     // The guide's students stay on it, whatever the submitted roster said.
421:     if (next.kind === "educational") await enrolGuideStudents(next.teacher);
422:

SOURCE server/Entities/Lesson/Lesson.controller.js lines 455-553
455:
456: // ADD STUDENTS
457: const addToList = async (req, res) => {
458:   try {
459:     const { id } = req.params;
460:     if (tooManyTz(req.body)) return res.status(400).json(TOO_MANY);
461:     if (notAList(req.body)) return res.status(400).json(NOT_A_LIST);
462:     const list = req.body.list_students || [];
463:
464:     const existingRes = await LessonModelDef.get({ _id: id });
465:     if (!existingRes?.result?.length) {
466:       return res.status(404).json({ ok: false });
467:     }
468:
469:     const lesson = existingRes.result[0];
470:
471:     const set = new Set((lesson.list_students || []).map(String));
472:     let toAdd = list.filter((s) => !set.has(String(s)));
473:
474:     // A scoped actor adds _ids only for students he can see (addableIds);
475:     // anyone else must be named by exact tz in list_tz (idsFromTz).
476:     const visible = await scope.visibleStudentIds(req.actor);
477:     toAdd = visible ? await addableIds(toAdd, visible) : await existingIds(toAdd);
478:     if (req.body?.list_tz !== undefined) {
479:       toAdd = appendNew(toAdd, (await idsFromTz(req.body.list_tz)).filter((s) => !set.has(String(s))));
480:     }
481:
482:     const updatedList = [...lesson.list_students, ...toAdd];
483:
484:     const updatedAt = nextStamp(lesson);
485:     const saved = await LessonModelDef.updateExisting(
486:       sameVersion({ _id: id }, lesson),
487:       { list_students: updatedList, updatedAt, ...editorStamp(req) }
488:     );
489:     if (!saved?.result) return res.status(409).json(await raceLost(() => LessonModelDef.get({ _id: id })));
490:     await recordLesson(req, "update", lesson, { ...lesson, list_students: updatedList });
491:     notifyChange("lesson", id);
492:
493:     // The new version: the open edit screen saves on top of it, not a 409.
494:     return res.status(200).json({ ok: true, updatedAt });
495:   } catch (err) {
496:     logWithSource("Lesson.addToList", err);
497:     return res.status(500).json({ ok: false });
498:   }
499: };
500:
501: // REMOVE STUDENTS
502: const removeFromList = async (req, res) => {
503:   try {
504:     const { id } = req.params;
505:     if (notAList(req.body)) return res.status(400).json(NOT_A_LIST);
506:     const removeList = req.body.list_students || [];
507:
508:     const existingRes = await LessonModelDef.get({ _id: id });
509:     if (!existingRes?.result?.length) {
510:       return res.status(404).json({ ok: false });
511:     }
512:
513:     const lesson = existingRes.result[0];
514:     if (lesson.kind === "educational" && removeList.length) {
515:       const own = await StudentModelDef.get({ main_teacher: String(lesson.teacher) });
516:       const ownIds = new Set((own?.result || []).map((s) => String(s._id)));
517:       if (removeList.some((r) => ownIds.has(String(r)))) {
518:         return res.status(409).json({ ok: false, code: "EDUCATIONAL_MEMBER", message: "طلاب المرشد المسؤول يبقون في برنامجه التربوي. غيّر المرشد المسؤول في صفحة الطالب." });
519:       }
520:     }
521:
522:     // A scoped actor removes only students he can see; hidden ids stay.
523:     const visible = await scope.visibleStudentIds(req.actor);
524:     const updated = visible
525:       ? (lesson.list_students || []).filter((s) => {
526:         const key = String(s);
527:         return !(visible.has(key) && removeList.some((r) => String(r) === key));
528:       })
529:       // Compared as strings: the lesson may hold ObjectIds, the request strings.
530:       : (lesson.list_students || []).filter((s) => !removeList.some((r) => String(r) === String(s)));
531:
532:     const updatedAt = nextStamp(lesson);
533:     const saved = await LessonModelDef.updateExisting(
534:       sameVersion({ _id: id }, lesson),
535:       { list_students: updated, updatedAt, ...editorStamp(req) }
536:     );
537:     if (!saved?.result) return res.status(409).json(await raceLost(() => LessonModelDef.get({ _id: id })));
538:     await recordLesson(req, "update", lesson, { ...lesson, list_students: updated });
539:     notifyChange("lesson", id);
540:
541:     return res.status(200).json({ ok: true, updatedAt });
542:   } catch (err) {
543:     logWithSource("Lesson.removeFromList", err);
544:     return res.status(500).json({ ok: false });
545:   }
546: };
547:
548: const getLessonsByToDay = async (req, res) => {
549:   try {
550:     const dow = getDow1to7(new Date());
551:     const result = await LessonModelDef.get({ "date.day": dow });
552:     const visible = await scope.visibleStudentIds(req.actor);
553:

SOURCE apps/system/src/Components/Student/RegistrationConsent.jsx lines 1-63
1: import React, { useEffect, useRef, useState } from "react";
2: import SignaturePad from "./SignaturePad";
3: import styles from "./RegistrationConsent.module.css";
4:
5: // Agreement is required now; the stamp stays visibly pending until completed.
6: export default function RegistrationConsent({ rules, value, onChange }) {
7:   const [open, setOpen] = useState(false);
8:   const [drawing, setDrawing] = useState(true);
9:   const dialog = useRef(null);
10:   const link = useRef(null);
11:   const change = (patch) => onChange((previous) => ({ ...previous, ...patch }));
12:   useEffect(() => {
13:     if (!open) return undefined;
14:     const previousOverflow = document.body.style.overflow;
15:     document.body.style.overflow = "hidden";
16:     dialog.current?.querySelector("button")?.focus();
17:     return () => { document.body.style.overflow = previousOverflow; link.current?.focus(); };
18:   }, [open]);
19:   const onKeyDown = (event) => {
20:     if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
21:     if (event.key !== "Tab") return;
22:     const controls = Array.from(dialog.current.querySelectorAll("button:not(:disabled), input, [tabindex='0']"));
23:     const first = controls[0];
24:     const last = controls[controls.length - 1];
25:     if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
26:     else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
27:   };
28:   return (
29:     <section className={styles.section} aria-label="الموافقة على قوانين الجمعية">
30:       <button type="button" ref={link} className={styles.link} onClick={() => { setDrawing(!value.signature); setOpen(true); }}>قوانين الجمعية</button>
31:       <p role="status">{value.accepted
32:         ? value.signature ? "تمت الموافقة وإضافة التوقيع/الختم." : "تمت الموافقة. التوقيع/الختم مطلوب ويجب استكماله لاحقًا."
33:         : "يجب قراءة القوانين والموافقة عليها قبل إرسال الطلب."}</p>
34:       {open && (
35:         <div className={styles.overlay} onClick={() => setOpen(false)}>
36:           <div className={styles.dialog} ref={dialog} role="dialog" aria-modal="true" aria-labelledby="registration-rules-title" dir="rtl" onClick={(event) => event.stopPropagation()} onKeyDown={onKeyDown}>
37:             <div className={styles.heading}>
38:               <h2 id="registration-rules-title">قوانين الجمعية</h2>
39:               <button type="button" aria-label="إغلاق قوانين الجمعية" onClick={() => setOpen(false)}>×</button>
40:             </div>
41:             <div className={styles.rules} dir="auto" tabIndex={0}>{rules.text}</div>
42:             <label htmlFor="signer-name">اسم ولي الأمر (مطلوب)</label>
43:             <input id="signer-name" name="signerName" maxLength={100} value={value.signerName} onChange={(event) => change({ signerName: event.target.value })} />
44:             <div className={styles.actions}>
45:               <button type="button" aria-pressed={value.accepted} onClick={() => change({ accepted: true })}>أوافق على القوانين</button>
46:               <button type="button" aria-pressed={!value.accepted} onClick={() => change({ accepted: false })}>لا أوافق</button>
47:             </div>
48:             <label>توقيع / ختم ولي الأمر</label>
49:             <small>ارسم التوقيع أو الختم في اللوحة. يمكن إرسال الطلب بعد الموافقة والاسم، واستكمال التوقيع/الختم لاحقًا لدى الجمعية.</small>
50:             {!drawing && value.signature ? (
51:               <div>
52:                 <img className={styles.signature} src={value.signature} alt="توقيع/ختم ولي الأمر" />
53:                 <button type="button" onClick={() => { change({ signature: "" }); setDrawing(true); }}>إعادة التوقيع/الختم</button>
54:               </div>
55:             ) : <SignaturePad onChange={(signature) => change({ signature })} />}
56:             <button type="button" onClick={() => setOpen(false)}>حفظ والعودة إلى الطلب</button>
57:           </div>
58:         </div>
59:       )}
60:     </section>
61:   );
62: }
63:

SOURCE apps/system/src/Components/Student/RegistrationConsent.module.css lines 1-13
1: .section { margin: 12px 0 20px; }
2: .link { background: transparent !important; color: #1769a8 !important; text-decoration: underline; padding: 4px !important; width: auto !important; }
3: .overlay { position: fixed; inset: 0; background: #0008; z-index: 16000; display: flex; align-items: center; justify-content: center; padding: 16px; }
4: .dialog { background: white; color: #17283b; width: min(620px, 100%); max-height: 90dvh; overflow-y: auto; border-radius: 14px; padding: 20px; display: grid; gap: 12px; box-sizing: border-box; }
5: .heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
6: .heading h2 { margin: 0; }
7: .heading button { width: auto; }
8: .rules { white-space: pre-wrap; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
9: .actions { display: flex; flex-wrap: wrap; gap: 8px; }
10: .actions button { flex: 1; min-width: 130px; }
11: .actions button[aria-pressed='true'] { outline: 3px solid #419567; outline-offset: 2px; }
12: .signature { max-width: 100%; width: 400px; border: 1px solid #d1d5db; }
13:

SOURCE apps/system/src/Components/Student/EditStudent.jsx lines 304-355
304:   const handleSubmit = async (e) => {
305:     if (photoPick.busy) { toast.warn(PHOTO_NOT_READY); return; }
306:     let b = await validate();
307:     if (b) { toast.warn(b); return; }
308:     b = true
309:     const ff = ['tz', 'firstname', 'lastname', 'birth_date', 'gender', 'city', 'street', 'school', 'layer', 'health_status'];
310:     for(const nameTag in ff){
311:       const tag = document.getElementsByName(ff[nameTag])[0];
312:       // console.log('tag', tag, tag.name, tag.value);
313:       const msg = await validate(tag.name, tag.value);
314:       setError((prev) => ({ ...prev, [tag.name]: msg }));
315:       // console.log('msg', msg)
316:       if(msg && msg !== ''){
317:         b = false;
318:       }
319:     }
320:     // A new student has a responsible guide, who may be from the management. Older
321:     // students without one stay as they are until someone chooses (owner, 2026-11-05).
322:     if (!parent && !isEdit && canAssignGuide && !isDemo() && !form.main_teacher) {
323:       setError((prev) => ({ ...prev, main_teacher: "يجب اختيار المرشد المسؤول" }));
324:       b = false;
325:     }
326:     if(!b) return toast.warn("يُرجى تعبئة الحقول المطلوبة");
327:     const rules = parent ? inviteStatus.rules : null;
328:     if (parent && (!rules || !consent.accepted || !consent.signerName.trim())) {
329:       return toast.warn("يُرجى قراءة قوانين الجمعية والموافقة عليها وكتابة اسم ولي الأمر");
330:     }
331:     e.preventDefault();
332:     try {
333:       setSaving(true);
334:       setErr(null);
335:
336:       const payload = { ...form };
337:       if (parent) {
338:         const signed = rules ? { rulesVersion: rules.version, rulesAccepted: "true", signerName: consent.signerName.trim(), signature: consent.signature } : {};
339:         const res = await submitFromParent(registrationToken, { ...payload, ...signed }, photo);
340:         if (!res.ok) {
341:           if (res.code === "RULES_CHANGED") {
342:             const fresh = await validateINV(registrationToken);
343:             setInviteStatus({ checking: false, valid: fresh.valid, open: fresh.open, rules: fresh.rules });
344:             setConsent({ accepted: false, signerName: consent.signerName, signature: "" });
345:           }
346:           if (res.code === "INTAKE_CLOSED") {
347:             setInviteStatus({ checking: false, valid: true, open: false });
348:             return;
349:           }
350:           throw new Error(res.message);
351:         }
352:         setSubmitted(true);
353:         return;
354:       }
355:

SOURCE apps/system/src/Components/Student/EditStudent.jsx lines 583-632
583:         {error.notes != "" && <label style={{color: "red"}}>{error.notes}</label>}
584:       </fieldset>
585:
586:
587:       <div style={{ marginBottom: "16px" }}>
588:         <label>صورة الطالب:</label>
589:         <button onClick={
590:           ()=> {
591:             const input = document.createElement('input');
592:             input.type = "file";
593:             input.accept = "image/*"
594:             input.onchange = handlePhoto;
595:             input.click();
596:           }
597:         }> {photo ? "تغيير الصورة" : "اختر صورة"} </button>
598:         {photo && <button style={{marginLeft: "18px", backgroundColor: "red"}} onClick={() => { photoPick.cancel(); setPhoto(null); }}>إزالة الصورة</button>}
599:         <br />
600:
601:         {/* معاينة الصورة إذا موجودة */}
602:         {photo && (
603:           <img
604:             src={photo instanceof File ? URL.createObjectURL(photo) : passportSrc(photo)}
605:             alt="preview"
606:             style={PASSPORT_PREVIEW}
607:           />
608:         )}
609:       </div>
610:       </ReadOnlyArea>
611:
612:       {parent && inviteStatus.rules && (
613:         <RegistrationConsent key={inviteStatus.rules.version} rules={inviteStatus.rules} value={consent} onChange={setConsent} />
614:       )}
615:
616:       <div className={styles.buttonRow} style={{ gap: 8, flexWrap: "wrap" }}>
617:         <button type="submit" data-tour="student-save" onClick={handleSubmit} disabled={readonly || saving || (parent && (!consent.accepted || !consent.signerName.trim()))} style={{width:"100%"}}>
618:           {saving ? "جارٍ الحفظ…" : parent ? "إرسال الطلب" : (isEdit ? "حفظ التعديلات" : "إضافة الطالب")}
619:         </button>
620:
621:         {/* Deleting is on the student's page (owner, 2026-11-02). */}
622:
623:         {!parent && (<button type="button" data-tour="student-back" style={{ background: "#6b7280", width: "100%" }} onClick={() => navigate(-1)}>
624:           العودة إلى القائمة
625:         </button>)}
626:       </div>
627:     </div>
628:   );
629: };
630:
631: export default EditStudent;
632:

SOURCE apps/system/src/Components/Student/ConsentView.jsx lines 1-94
1: import React, { useCallback, useEffect, useState } from "react";
2: import { getConsent, getRules, signConsent } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
3: import { toast } from "../../ALERT/SystemToasts.jsx";
4: import Button from "../UI/Button.jsx";
5: import RequiredMark from "../UI/RequiredMark";
6: import SignaturePad from "./SignaturePad.jsx";
7:
8: const when = (value) => {
9:   const date = new Date(value);
10:   return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-GB");
11: };
12:
13: // A student the association added: the parent signs here, on this device.
14: function SignNow({ studentId, onSigned, signerName = "" }) {
15:   const [rules, setRules] = useState(undefined);
16:   const [form, setForm] = useState({ accepted: false, signerName, signature: "" });
17:   const [busy, setBusy] = useState(false);
18:
19:   useEffect(() => {
20:     let alive = true;
21:     getRules().then((res) => { if (alive) setRules(res.ok ? res.rules : null); });
22:     return () => { alive = false; };
23:   }, []);
24:
25:   if (rules === undefined) return null;
26:   if (!rules?.text) return <p role="status">يجب نشر نظام الجمعية أولًا (من «رابط تسجيل الأهل») قبل التوقيع.</p>;
27:
28:   const submit = async () => {
29:     if (!form.accepted || !form.signerName.trim() || !form.signature) {
30:       toast.warn("يُرجى الموافقة على النظام وكتابة اسم ولي الأمر والتوقيع");
31:       return;
32:     }
33:     setBusy(true);
34:     const res = await signConsent(studentId, { rulesVersion: rules.version, rulesAccepted: "true", signerName: form.signerName.trim(), signature: form.signature });
35:     setBusy(false);
36:     if (!res.ok) { toast.error(res.message); return; }
37:     toast.success("تم حفظ التوقيع");
38:     onSigned();
39:   };
40:
41:   return (
42:     <div style={{ display: "grid", gap: 8 }}>
43:       <div dir="auto" tabIndex={0} style={{ maxHeight: 200, overflowY: "auto", whiteSpace: "pre-wrap", padding: 8, border: "1px solid #d1d5db", borderRadius: 8 }}>{rules.text}</div>
44:       <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
45:         <input type="checkbox" style={{ width: "auto" }} checked={form.accepted} onChange={(event) => setForm((prev) => ({ ...prev, accepted: event.target.checked }))} />
46:         <span>قرأ ولي الأمر نظام الجمعية ويوافق عليه<RequiredMark /></span>
47:       </label>
48:       <label htmlFor="consent-signer">اسم ولي الأمر:<RequiredMark /></label>
49:       <input id="consent-signer" maxLength={100} value={form.signerName} onChange={(event) => setForm((prev) => ({ ...prev, signerName: event.target.value }))} />
50:       <label>توقيع / ختم ولي الأمر:<RequiredMark /></label>
51:       <SignaturePad onChange={(signature) => setForm((prev) => ({ ...prev, signature }))} />
52:       <div><Button size="sm" loading={busy} onClick={submit}>حفظ التوقيع</Button></div>
53:     </div>
54:   );
55: }
56:
57: // The signature a parent gave, with the version signed; with none, the place to sign.
58: export default function ConsentView({ studentId }) {
59:   const [state, setState] = useState({ loading: true, consent: null });
60:
61:   const load = useCallback(() => {
62:     let alive = true;
63:     getConsent(studentId).then((res) => {
64:       if (alive) setState({ loading: false, consent: res.ok ? res.consent : null, error: res.ok ? "" : res.message });
65:     });
66:     return () => { alive = false; };
67:   }, [studentId]);
68:   useEffect(() => load(), [load]);
69:
70:   if (state.loading) return <div role="status">جارٍ التحميل…</div>;
71:   if (state.error) return <div role="alert">{state.error}</div>;
72:   if (!state.consent?.signature) {
73:     return (
74:       <div style={{ display: "grid", gap: 8 }}>
75:         <p style={{ margin: 0 }}>{state.consent
76:           ? `وافق ولي الأمر ${state.consent.signerName} بتاريخ ${when(state.consent.acceptedAt)}. التوقيع/الختم مطلوب ولم يُستكمل بعد.`
77:           : "لا يوجد توقيع لهذا الطالب. التوقيع/الختم مطلوب ويجب استكماله."}</p>
78:         <SignNow studentId={studentId} signerName={state.consent?.signerName} onSigned={load} />
79:       </div>
80:     );
81:   }
82:   const { signerName, signedAt, rulesVersion, rulesText, signature } = state.consent;
83:   return (
84:     <div style={{ display: "grid", gap: 8 }}>
85:       <p style={{ margin: 0 }}>وقّع <strong dir="auto">{signerName}</strong> بتاريخ {when(signedAt)} على الإصدار {rulesVersion}.</p>
86:       <img src={signature} alt="توقيع ولي الأمر" style={{ maxWidth: 320, width: "100%", background: "#fff", border: "1px solid #d1d5db", borderRadius: 8 }} />
87:       <details>
88:         <summary>النص الذي تم التوقيع عليه</summary>
89:         <div dir="auto" style={{ whiteSpace: "pre-wrap" }}>{rulesText}</div>
90:       </details>
91:     </div>
92:   );
93: }
94:

SOURCE apps/system/src/Components/Student/RulesEditor.jsx lines 1-72
1: import React, { useEffect, useState } from "react";
2: import Button from "../UI/Button.jsx";
3: import { toast } from "../../ALERT/SystemToasts.jsx";
4: import { ask } from "../Provides/confirmBus.js";
5: import { getRules, publishRules } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
6: import { DEFAULT_RULES } from "./defaultRules";
7:
8: // The rules a parent signs on the registration link. Publishing makes a new
9: // version; those who already signed keep the version they signed.
10: export default function RulesEditor() {
11:   const [loaded, setLoaded] = useState(false);
12:   const [version, setVersion] = useState(0);
13:   const [text, setText] = useState("");
14:   const [saved, setSaved] = useState("");
15:   const [busy, setBusy] = useState(false);
16:   const [error, setError] = useState("");
17:
18:   useEffect(() => {
19:     let alive = true;
20:     getRules().then((res) => {
21:       if (!alive) return;
22:       if (res.ok) {
23:         setVersion(res.rules?.version || 0);
24:         setText(res.rules ? (res.rules.text ?? "") : DEFAULT_RULES);
25:         setSaved(res.rules?.text || "");
26:       } else setError(res.message || "تعذّر تحميل نظام الجمعية");
27:       setLoaded(true);
28:     });
29:     return () => { alive = false; };
30:   }, []);
31:
32:   const publish = async () => {
33:     let confirmed = false;
34:     try {
35:       confirmed = await ask("", {
36:         title: "نشر نظام الجمعية",
37:         message: text.trim()
38:           ? "من الآن سيوقّع الأهل الجدد على هذا النص. من وقّع سابقًا يبقى توقيعه على النص الذي وقّعه."
39:           : "النص فارغ: سيتوقف رابط التسجيل عن استقبال طلبات الأهل. هل تريد المتابعة؟",
40:         confirmText: "نشر",
41:         cancelText: "إلغاء",
42:       });
43:     } catch {
44:       toast.error("تعذّر فتح نافذة التأكيد، حاول مرة أخرى.");
45:       return;
46:     }
47:     if (!confirmed) return;
48:     setBusy(true);
49:     const res = await publishRules(text);
50:     setBusy(false);
51:     if (!res.ok) return toast.error(res.message);
52:     setVersion(res.rules.version);
53:     setSaved(res.rules.text);
54:     toast.success("تم نشر نظام الجمعية");
55:   };
56:
57:   if (!loaded) return null;
58:   if (error) return <p role="alert">{error}</p>;
59:   return (
60:     <div style={{ display: "grid", gap: 8 }}>
61:       <h3 style={{ margin: 0 }}>نظام الجمعية{version ? ` (الإصدار ${version})` : ""}</h3>
62:       <small>يظهر للأهل في رابط «قوانين الجمعية». الموافقة مطلوبة لإرسال الطلب، والتوقيع/الختم مطلوب ويمكن استكماله لاحقًا. النص الافتراضي متاح ما لم تنشر الإدارة نصًا آخر.</small>
63:       {!saved.trim() && version > 0 && <strong role="alert" style={{ color: "#b91c1c" }}>النص المنشور فارغ: رابط التسجيل لا يستقبل طلبات.</strong>}
64:       <textarea aria-label="نص نظام الجمعية" rows={8} maxLength={20000} value={text} onChange={(event) => setText(event.target.value)} />
65:       <div>
66:         <Button size="sm" variant="secondary" disabled={busy || text === DEFAULT_RULES} onClick={() => setText(DEFAULT_RULES)}>استعادة النص الافتراضي</Button>{" "}
67:         <Button size="sm" loading={busy} disabled={text === saved} onClick={publish}>نشر</Button>
68:       </div>
69:     </div>
70:   );
71: }
72:

SOURCE apps/system/src/Components/Student/SignaturePad.jsx lines 1-80
1: import React, { useEffect, useRef, useState } from "react";
2:
3: const WIDTH = 600;
4: const HEIGHT = 200;
5:
6: // A finger or mouse signature. onChange gets a PNG data address, or "" when cleared.
7: export default function SignaturePad({ onChange }) {
8:   const canvasRef = useRef(null);
9:   const drawing = useRef(false);
10:   const [empty, setEmpty] = useState(true);
11:
12:   useEffect(() => {
13:     const context = canvasRef.current?.getContext?.("2d");
14:     if (!context) return;
15:     context.lineWidth = 3;
16:     context.lineCap = "round";
17:     context.lineJoin = "round";
18:     context.strokeStyle = "#111827";
19:   }, []);
20:
21:   const point = (event) => {
22:     const box = canvasRef.current.getBoundingClientRect();
23:     return {
24:       x: ((event.clientX - box.left) * WIDTH) / (box.width || WIDTH),
25:       y: ((event.clientY - box.top) * HEIGHT) / (box.height || HEIGHT),
26:     };
27:   };
28:
29:   const start = (event) => {
30:     event.preventDefault();
31:     event.currentTarget.setPointerCapture?.(event.pointerId);
32:     drawing.current = true;
33:     const context = canvasRef.current.getContext("2d");
34:     const { x, y } = point(event);
35:     context.beginPath();
36:     context.moveTo(x, y);
37:     context.lineTo(x + 0.1, y + 0.1);
38:     context.stroke();
39:     setEmpty(false);
40:   };
41:
42:   const move = (event) => {
43:     if (!drawing.current) return;
44:     const context = canvasRef.current.getContext("2d");
45:     const { x, y } = point(event);
46:     context.lineTo(x, y);
47:     context.stroke();
48:   };
49:
50:   const end = () => {
51:     if (!drawing.current) return;
52:     drawing.current = false;
53:     onChange(canvasRef.current.toDataURL("image/png"));
54:   };
55:
56:   const clear = () => {
57:     canvasRef.current.getContext("2d").clearRect(0, 0, WIDTH, HEIGHT);
58:     setEmpty(true);
59:     onChange("");
60:   };
61:
62:   return (
63:     <div>
64:       <canvas
65:         ref={canvasRef}
66:         width={WIDTH}
67:         height={HEIGHT}
68:         aria-label="مساحة التوقيع"
69:         data-testid="signature-pad"
70:         style={{ width: "100%", height: "auto", background: "#fff", border: "1px solid #9ca3af", borderRadius: 8, touchAction: "none", display: "block" }}
71:         onPointerDown={start}
72:         onPointerMove={move}
73:         onPointerUp={end}
74:         onPointerCancel={end}
75:       />
76:       <button type="button" onClick={clear} disabled={empty} style={{ marginTop: 6 }}>مسح التوقيع</button>
77:     </div>
78:   );
79: }
80:

SOURCE apps/system/src/Components/Lesson/LessonRoster.jsx lines 1-349
1: import React, { useEffect, useMemo, useRef, useState } from "react";
2: import { Link } from "react-router-dom";
3: import styles from "./LessonRoster.module.css";
4: import Button from "../UI/Button";
5: import { useI18n } from "../../i18n/I18nContext";
6: import { toast } from "../../ALERT/SystemToasts";
7: import { lookupStudent } from "../../WebServer/services/student/functionsStudent";
8: import useItemLock from "../../locks/useItemLock";
9: import LockedScreen from "../../locks/LockedScreen";
10: import {
11:   filterRosterStudents,
12:   isFullTz,
13:   rosterConflicts,
14:   rosterSummary,
15:   searchStudentsToAdd,
16: } from "../../utils/lessonRoster";
17:
18: const nameOf = (student) => `${student?.firstname || ""} ${student?.lastname || ""}`.trim();
19: const detailsOf = (student) => [student?.tz, student?.layer].filter(Boolean).join(" · ");
20:
21: // Students of one lesson. The enrolled list has its own search and scrolls
22: // after three students; "إضافة طالب" opens a window listing the registered
23: // students who are not in the lesson yet. Removing offers an undo, and a
24: // student already in another lesson at the same time gets a warning.
25: // Changes stay in the form until the lesson is saved.
26: // hiddenCount: students the server hid from this viewer (shown only as a number).
27: // pending: students found by ID number on a lesson not saved yet.
28: // onLookupAdd(student) adds a found student; it resolves true when they joined.
29: // linkOf(student): when given, each enrolled name links there (the lesson page).
30: // confirmRemove(student): when given, removing asks it first and offers no
31: // undo (the lesson page saves each change at once).
32: export default function LessonRoster({
33:   lesson,
34:   students,
35:   allLessons,
36:   canEdit,
37:   onChange,
38:   hiddenCount = 0,
39:   pending = [],
40:   onLookupAdd,
41:   onRemovePending,
42:   linkOf,
43:   confirmRemove,
44: }) {
45:   const { t } = useI18n();
46:   const [lookupTz, setLookupTz] = useState("");
47:   const [lookupMsg, setLookupMsg] = useState("");
48:   const [lookupBusy, setLookupBusy] = useState(false);
49:   const [found, setFound] = useState(null);
50:   const [rosterQuery, setRosterQuery] = useState("");
51:   const [pickerOpen, setPickerOpen] = useState(false);
52:   // Saved forms already hold this lock. The view page holds it throughout
53:   // its add window, including searching and choosing, rather than only on save.
54:   const pickerLock = useItemLock(pickerOpen && confirmRemove && lesson._id ? `lesson:${lesson._id}` : null);
55:   const [pickerQuery, setPickerQuery] = useState("");
56:   const [addedInPicker, setAddedInPicker] = useState(0);
57:   // Ids whose add is on its way; in the form they clear once the list updates.
58:   const adding = useRef(new Set());
59:   const [lastRemoved, setLastRemoved] = useState(null);
60:
61:   const selectedIds = useMemo(() => (lesson.list_students || []).map(String), [lesson.list_students]);
62:   useEffect(() => {
63:     if (!confirmRemove) adding.current.clear();
64:   }, [selectedIds, confirmRemove]);
65:   const byId = useMemo(
66:     () => Object.fromEntries((students || []).map((student) => [String(student._id), student])),
67:     [students]
68:   );
69:   const enrolled = selectedIds.map((id) => byId[id]).filter(Boolean);
70:   const shown = filterRosterStudents(enrolled, rosterQuery);
71:   const conflicts = useMemo(() => rosterConflicts(lesson, allLessons), [lesson, allLessons]);
72:   const available = useMemo(
73:     () => (pickerOpen ? searchStudentsToAdd(students, pickerQuery, selectedIds) : []),
74:     [pickerOpen, students, pickerQuery, selectedIds]
75:   );
76:
77:   useEffect(() => {
78:     if (!pickerOpen) return undefined;
79:     const onKey = (e) => { if (e.key === "Escape") setPickerOpen(false); };
80:     window.addEventListener("keydown", onKey);
81:     return () => window.removeEventListener("keydown", onKey);
82:   }, [pickerOpen]);
83:
84:   const { others } = rosterSummary({ visible: enrolled.length, hiddenCount });
85:
86:   const runLookup = async () => {
87:     const tz = lookupTz.trim();
88:     setFound(null);
89:     if (!isFullTz(tz)) { setLookupMsg(t("roster.lookupInvalid")); return; }
90:     setLookupBusy(true);
91:     setLookupMsg("");
92:     const res = await lookupStudent(tz);
93:     setLookupBusy(false);
94:     if (!res.ok) { setLookupMsg(res.notFound ? t("roster.lookupNotFound") : t("roster.lookupFailed")); return; }
95:     const id = String(res.student._id);
96:     if (selectedIds.includes(id) || pending.some((p) => String(p._id) === id)) {
97:       setLookupMsg(t("roster.alreadyIn"));
98:       return;
99:     }
100:     setFound(res.student);
101:   };
102:
103:   const addFound = async () => {
104:     if (!found || !onLookupAdd || pickerLock.status !== "held") return;
105:     setLookupBusy(true);
106:     const joined = await onLookupAdd(found);
107:     setLookupBusy(false);
108:     if (joined) {
109:       toast.success(t("roster.added"));
110:       setAddedInPicker((count) => count + 1);
111:       setFound(null);
112:       setLookupTz("");
113:       setLookupMsg("");
114:     } else {
115:       toast.warn(t("roster.notAdded"));
116:     }
117:   };
118:
119:   const openPicker = () => {
120:     setLookupTz("");
121:     setLookupMsg("");
122:     setFound(null);
123:     setPickerQuery("");
124:     setAddedInPicker(0);
125:     setPickerOpen(true);
126:   };
127:
128:   const add = async (ids) => {
129:     if (pickerLock.status !== "held") return;
130:     // A second click before the list catches up (a double click) adds nothing.
131:     const fresh = ids.map(String).filter((id) => !adding.current.has(id) && !selectedIds.includes(id));
132:     if (!fresh.length) return;
133:     fresh.forEach((id) => adding.current.add(id));
134:     setLastRemoved(null);
135:     const next = [...selectedIds, ...fresh];
136:     // On the lesson page (confirmRemove set) a change is saved at once:
137:     // count it only once onChange reports the save went through.
138:     if (confirmRemove) {
139:       try {
140:         if (await onChange(next)) setAddedInPicker((count) => count + fresh.length);
141:       } finally {
142:         fresh.forEach((id) => adding.current.delete(id));
143:       }
144:       return;
145:     }
146:     setAddedInPicker((count) => count + fresh.length);
147:     onChange(next);
148:   };
149:
150:   const remove = async (student) => {
151:     if (confirmRemove) {
152:       if (!(await confirmRemove(student))) return;
153:       onChange(selectedIds.filter((id) => id !== String(student._id)));
154:       return;
155:     }
156:     const index = selectedIds.indexOf(String(student._id));
157:     setLastRemoved({ student, index });
158:     onChange(selectedIds.filter((id) => id !== String(student._id)));
159:   };
160:
161:   const undo = () => {
162:     if (!lastRemoved) return;
163:     const next = [...selectedIds];
164:     next.splice(lastRemoved.index, 0, String(lastRemoved.student._id));
165:     onChange(next);
166:     setLastRemoved(null);
167:   };
168:
169:   return (
170:     <div className={styles.roster}>
171:       <div className={styles.toolbar}>
172:         <input
173:           type="search"
174:           value={rosterQuery}
175:           onChange={(e) => setRosterQuery(e.target.value)}
176:           data-tour="roster-search"
177:           placeholder="ابحث في طلاب البرنامج"
178:           aria-label="ابحث في طلاب البرنامج"
179:         />
180:         {canEdit && (
181:           <Button type="button" data-tour="roster-add" onClick={openPicker}>
182:             + إضافة طالب
183:           </Button>
184:         )}
185:       </div>
186:
187:       {lastRemoved && (
188:         <div className={styles.undo} role="status">
189:           <span>تمت إزالة {nameOf(lastRemoved.student)} من البرنامج</span>
190:           <button type="button" onClick={undo}>تراجع</button>
191:         </div>
192:       )}
193:
194:       {enrolled.length === 0 ? (
195:         <p className={styles.empty}>لا يوجد طلاب في هذا البرنامج بعد</p>
196:       ) : shown.length === 0 ? (
197:         <p className={styles.empty}>لا يوجد طالب مطابق في هذا البرنامج</p>
198:       ) : (
199:         // Three students visible; the rest scroll.
200:         <ul className={`${styles.list} ${styles.scrollThree}`} data-tour="roster-list">
201:           {shown.map((student) => (
202:             <li key={student._id} className={styles.row}>
203:               <span className={styles.who}>
204:                 {linkOf
205:                   ? <Link to={linkOf(student)}><strong>{nameOf(student)}</strong></Link>
206:                   : <strong>{nameOf(student)}</strong>}
207:                 <small>{detailsOf(student)}</small>
208:                 {conflicts[student._id] && (
209:                   <span className={styles.conflict}>
210:                     لديه برنامج آخر في الوقت نفسه: {conflicts[student._id].join("، ")}
211:                   </span>
212:                 )}
213:               </span>
214:               {canEdit && (
215:                 <Button size="sm" variant="danger" onClick={() => remove(student)}>
216:                   إزالة
217:                 </Button>
218:               )}
219:             </li>
220:           ))}
221:         </ul>
222:       )}
223:
224:       {others > 0 && (
225:         <p className={styles.hint} role="status">{t("roster.others").replace("{n}", String(others))}</p>
226:       )}
227:
228:       {pending.length > 0 && (
229:         <div>
230:           <small className={styles.hint}>{t("roster.pendingTitle")}</small>
231:           <ul className={styles.list}>
232:             {pending.map((student) => (
233:               <li key={student._id} className={styles.row}>
234:                 <span className={styles.who}>
235:                   <strong>{nameOf(student)}</strong>
236:                   <small>{student.tz}</small>
237:                 </span>
238:                 {canEdit && (
239:                   <Button size="sm" variant="danger" onClick={() => onRemovePending && onRemovePending(student)}>
240:                     {t("roster.pendingRemove")}
241:                   </Button>
242:                 )}
243:               </li>
244:             ))}
245:           </ul>
246:         </div>
247:       )}
248:
249:       {canEdit && !confirmRemove && <p className={styles.hint}>لا تُحفظ التغييرات إلا بعد الضغط على زر الحفظ.</p>}
250:
251:       {pickerOpen && (
252:         <div className={styles.overlay} onClick={() => setPickerOpen(false)}>
253:           <div
254:             className={styles.picker}
255:             data-tour="roster-picker"
256:             role="dialog"
257:             aria-modal="true"
258:             aria-labelledby="roster-picker-title"
259:             onClick={(e) => e.stopPropagation()}
260:           >
261:             <div className={styles.pickerHeader}>
262:               <h3 id="roster-picker-title">إضافة طلاب إلى البرنامج</h3>
263:               {addedInPicker > 0 && <span className={styles.addedCount}>أُضيف: {addedInPicker}</span>}
264:             </div>
265:             {pickerLock.status === "blocked" ? <LockedScreen holder={pickerLock.holder} />
266:               : pickerLock.status !== "held" ? <p role="status">{pickerLock.status === "loading" ? "جارٍ حجز البرنامج…" : "فُقد قفل البرنامج. أغلق النافذة وافتحها من جديد."}</p> : (
267:               <>
268:             <input
269:               type="search"
270:               value={pickerQuery}
271:               onChange={(e) => setPickerQuery(e.target.value)}
272:               placeholder="ابحث عن طالب جديد بالاسم أو رقم الهوية"
273:               aria-label="ابحث عن طالب لإضافته"
274:               autoFocus
275:             />
276:             {onLookupAdd && (
277:               <div className={styles.lookup}>
278:                 <strong>{t("roster.lookupTitle")}</strong>
279:                 <small>{t("roster.lookupHint")}</small>
280:                 <div className={styles.toolbar}>
281:                   <input
282:                     type="text"
283:                     inputMode="numeric"
284:                     value={lookupTz}
285:                     onChange={(e) => { setLookupTz(e.target.value); setFound(null); setLookupMsg(""); }}
286:                     onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runLookup(); } }}
287:                     placeholder={t("roster.lookupPlaceholder")}
288:                     aria-label={t("roster.lookupTitle")}
289:                   />
290:                   <Button type="button" size="sm" disabled={lookupBusy} onClick={runLookup}>
291:                     {t("roster.lookupButton")}
292:                   </Button>
293:                 </div>
294:                 {lookupMsg && <span className={styles.conflict} role="alert">{lookupMsg}</span>}
295:                 {found && (
296:                   <div className={styles.row}>
297:                     <span className={styles.who}>
298:                       <strong>{nameOf(found)}</strong>
299:                       <small>{found.tz}</small>
300:                     </span>
301:                     <Button size="sm" variant="success" disabled={lookupBusy} onClick={addFound}>
302:                       {t("roster.lookupAdd")}
303:                     </Button>
304:                   </div>
305:                 )}
306:               </div>
307:             )}
308:
309:             <small className={styles.pickerCount}>
310:               طلاب غير مضافين{pickerQuery.trim() ? " يطابقون البحث" : ""}: {available.length}
311:             </small>
312:
313:             {available.length === 0 ? (
314:               <p className={styles.empty}>لا يوجد طلاب غير مضافين{pickerQuery.trim() ? " يطابقون البحث" : ""}</p>
315:             ) : (
316:               <ul className={`${styles.list} ${styles.pickerList}`}>
317:                 {available.map((student, index) => (
318:                   <li key={student._id} className={styles.row}>
319:                     <span className={styles.who}>
320:                       <strong>{nameOf(student)}</strong>
321:                       <small>{detailsOf(student)}</small>
322:                     </span>
323:                     <Button size="sm" variant="success" data-tour={index === 0 ? "roster-picker-add" : undefined} onClick={() => add([student._id])}>
324:                       إضافة
325:                     </Button>
326:                   </li>
327:                 ))}
328:               </ul>
329:             )}
330:
331:               </>
332:             )}
333:             <div className={styles.pickerFooter}>
334:               {pickerLock.status === "held" && pickerQuery.trim() && available.length > 1 && (
335:                 <Button size="sm" variant="secondary" onClick={() => add(available.map((s) => s._id))}>
336:                   إضافة كل النتائج ({available.length})
337:                 </Button>
338:               )}
339:               <Button type="button" data-tour="roster-picker-done" onClick={() => setPickerOpen(false)}>
340:                 تم
341:               </Button>
342:             </div>
343:           </div>
344:         </div>
345:       )}
346:     </div>
347:   );
348: }
349:

SOURCE apps/system/src/Components/Lesson/LessonView.jsx lines 65-99
65:     getAllLesson().then((r) => setAllLessons(r.ok ? r.lessons : []));
66:     loadStudents();
67:   }, [id, reload, loadStudents]);
68:
69:   // Saves one roster change after the ones before it, then shows the lesson
70:   // (and the students, as a student added by ID may have become visible).
71:   // `forId` is the lesson the change was made on: a confirmation answered
72:   // after the page moved to another lesson (or closed) writes nothing.
73:   const apply = (call, forId = id) => {
74:     if (leaving.current || !mounted.current || shownId.current !== forId) return Promise.resolve(false);
75:     const run = queue.current.then(async () => {
76:       const res = await withLock(`lesson:${id}`, call).catch((err) => ({
77:         ok: false,
78:         message: err?.response?.data?.message || err?.message,
79:       }));
80:       if (!res.ok) toast.warn(res.message || "تعذّر حفظ التغيير");
81:       await Promise.all([reload(), res.ok ? loadStudents() : null]);
82:       return res.ok;
83:     });
84:     queue.current = run.catch(() => false);
85:     return run;
86:   };
87:
88:   const onChange = async (ids) => {
89:     const before = (lesson.list_students || []).map(String);
90:     const added = ids.filter((x) => !before.includes(x));
91:     const removed = before.filter((x) => !ids.includes(x));
92:     // Resolves true when every write succeeded (the roster counts additions then).
93:     const runs = [];
94:     if (added.length) runs.push(apply(() => addToList(id, { list_students: added })));
95:     if (removed.length) runs.push(apply(() => removeFromList(id, removed)));
96:     return (await Promise.all(runs)).every(Boolean);
97:   };
98:
99:   // The form takes the same lock this page's writes take; it opens only after

SOURCE apps/system/src/locks/withLock.js lines 1-21
1: import api from "../WebServer/services/api";
2: import { isDemo } from "../journey/demoMode";
3:
4: // A one-shot lock for a single write (the +/- stat buttons): acquire the key,
5: // run the write, release. A 423 from the acquire is thrown to the caller
6: // (handleSaveError turns it into the holder message); the write never runs.
7: // A lock this tab already held before (an open edit screen) is kept: only a
8: // lock the acquire created (`created` in its answer) is released, and the
9: // call finishes only once that release is done: a next write that reuses the
10: // lock must never have it released from under it. A failed release is ignored.
11: export default async function withLock(key, run) {
12:   if (isDemo()) return run();
13:   const { data } = (await api.post("/locks/acquire", { key })) || {};
14:   const created = data?.created !== false;
15:   try {
16:     return await run();
17:   } finally {
18:     if (created) await api.post("/locks/release", { key }).catch(() => {});
19:   }
20: }
21:

SOURCE server/test/parent-registration.test.js lines 569-645
569: test("the built-in rules are public version zero, stay readable after publication, and match the editor default", async () => {
570:   const { DEFAULT_RULES } = require("../Entities/InviteToken/defaultRules");
571:   const clientText = fs.readFileSync(path.join(__dirname, "../../apps/system/src/Components/Student/defaultRules.js"), "utf8").match(/String.raw`([\s\S]*?)`;/)[1].replace(/\r\n/g, "\n");
572:   assert.equal(clientText, DEFAULT_RULES.replace(/\r\n/g, "\n"));
573:   const ctrl = loadController({ rules: [] });
574:   const token = await currentToken(ctrl);
575:   const opened = (await call(ctrl.validateToken, { params: { token } })).body;
576:   assert.equal(opened.open, true);
577:   assert.equal(opened.rules.version, 0);
578:   assert.equal(opened.rules.text, DEFAULT_RULES);
579:   assert.equal(ctrl.models.rules.snapshot().length, 0, "read does not seed or migrate data");
580:   const sent = await call(ctrl.submitRegistration, { params: { token }, body: registration({ rulesVersion: "0" }) });
581:   assert.equal(sent.statusCode, 200);
582:   const published = await call(ctrl.publishRules, { body: { text: "Edited" }, actor: { name: "Staff Name" } });
583:   assert.equal(published.body.rules.version, 1);
584:   assert.equal(ctrl.models.rules.snapshot()[0].createdByName, "Staff Name");
585:   const read = await call(ctrl.getConsent, { params: { studentId: ctrl.models.students.snapshot()[0]._id } });
586:   assert.equal(read.body.consent.rulesText, DEFAULT_RULES);
587: });
588:
589: test("agreement without a stamp sends a request but stays unsigned until later completion", async () => {
590:   const ctrl = loadController();
591:   const token = await currentToken(ctrl);
592:   const sent = await call(ctrl.submitRegistration, { params: { token }, body: registration({ signature: "" }) });
593:   assert.equal(sent.statusCode, 200);
594:   const [student] = ctrl.models.students.snapshot();
595:   const params = { studentId: student._id };
596:   assert.equal(student.consentAt, null);
597:   let read = (await call(ctrl.getConsent, { params })).body.consent;
598:   assert.ok(read.acceptedAt);
599:   assert.equal(read.signedAt, null);
600:   assert.equal(read.signature, null);
601:   assert.equal(read.signaturePending, true);
602:   assert.equal((await call(ctrl.signConsent, { params, body: registration({ signature: "" }) })).statusCode, 400);
603:   assert.equal((await call(ctrl.signConsent, { params, body: registration(), actor: { name: "Recorder" } })).statusCode, 200);
604:   assert.equal(ctrl.models.consents.snapshot().length, 1);
605:   read = (await call(ctrl.getConsent, { params })).body.consent;
606:   assert.equal(read.signaturePending, false);
607:   assert.ok(read.signedAt);
608:   assert.ok(ctrl.models.students.snapshot()[0].consentAt);
609:   assert.equal(ctrl.models.consents.snapshot()[0].recordedBy, "Recorder");
610: });
611:
612: test("declining agreement cannot create a student even with a valid stamp", async () => {
613:   const ctrl = loadController();
614:   const token = await currentToken(ctrl);
615:   const sent = await call(ctrl.submitRegistration, { params: { token }, body: registration({ rulesAccepted: "false" }) });
616:   assert.equal(sent.statusCode, 400);
617:   assert.equal(ctrl.models.students.snapshot().length, 0);
618:   assert.equal(ctrl.models.consents.snapshot().length, 0);
619: });
620:
621: test("a partial later save can repair the student marker without replacing the signature evidence", async () => {
622:   const ctrl = loadController({ students: [{ tz: "1" }] });
623:   const params = { studentId: ctrl.models.students.snapshot()[0]._id };
624:   const update = ctrl.models.students.updateExisting;
625:   ctrl.models.students.updateExisting = async () => { throw new Error("simulated interrupted marker write"); };
626:   assert.equal((await call(ctrl.signConsent, { params, body: registration() })).statusCode, 500);
627:   const original = plain(ctrl.models.consents.snapshot()[0]);
628:   ctrl.models.students.updateExisting = update;
629:   assert.equal((await call(ctrl.signConsent, { params, body: registration({ signerName: "Replacement" }) })).statusCode, 200);
630:   assert.deepEqual(plain(ctrl.models.consents.snapshot()[0]), original);
631:   assert.equal(ctrl.models.students.snapshot()[0].consentAt.toISOString(), new Date(original.signedAt).toISOString());
632: });
633:
634: test("a racing pending completion cannot overwrite already stored evidence", async () => {
635:   const ctrl = loadController();
636:   const token = await currentToken(ctrl);
637:   await call(ctrl.submitRegistration, { params: { token }, body: registration({ signature: "" }) });
638:   const params = { studentId: ctrl.models.students.snapshot()[0]._id };
639:   ctrl.models.consents.updateExisting = async () => ({ success: true, result: null });
640:   const res = await call(ctrl.signConsent, { params, body: registration() });
641:   assert.equal(res.statusCode, 409);
642:   assert.equal(res.body.code, "CONSENT_CHANGED");
643:   assert.equal(ctrl.models.students.snapshot()[0].consentAt, null);
644: });
645:

SOURCE server/test/consent-model.test.js lines 1-36
1: const test = require("node:test");
2: const assert = require("node:assert/strict");
3: const fs = require("node:fs");
4: const vm = require("node:vm");
5:
6: function load({ failIndex = false } = {}) {
7:   const writes = [], indexes = [];
8:   const module = { exports: {} };
9:   const api = { create: async (args) => { writes.push(args); return { success: true }; } };
10:   vm.runInNewContext(fs.readFileSync(require.resolve("../Entities/InviteToken/Rules.model"), "utf8"), {
11:     module, process: { env: {} }, require(name) {
12:       if (name === "../api") return api;
13:       assert.equal(name, "../../utils/ensureIndexes");
14:       return { collectionOf: (model) => model.collection, ensureIndexes: async (collection, specs) => {
15:         if (failIndex) throw new Error("index unavailable");
16:         indexes.push({ collection, specs });
17:       } };
18:     },
19:   });
20:   return { model: module.exports.ConsentModelDef, indexes, writes };
21: }
22: test("consent creation requires and caches the unique student index", async () => {
23:   const ctx = load();
24:   await ctx.model.create({ studentId: "one" }); await ctx.model.create({ studentId: "two" });
25:   assert.equal(ctx.indexes.length, 1);
26:   assert.equal(ctx.indexes[0].collection, "StudentConsents");
27:   assert.equal(ctx.indexes[0].specs[0].key.studentId, 1);
28:   assert.equal(ctx.indexes[0].specs[0].options.unique, true);
29:   assert.equal(ctx.writes.length, 2);
30: });
31: test("index failure prevents accepting a consent without concurrency protection", async () => {
32:   const ctx = load({ failIndex: true });
33:   await assert.rejects(ctx.model.create({ studentId: "one" }), /index unavailable/);
34:   assert.equal(ctx.writes.length, 0);
35: });
36:

SOURCE server/test/educational-lesson.test.js lines 1-96
1: const assert = require("node:assert/strict");
2: const test = require("node:test");
3: const { createEducationalLessons } = require("../services/educationalLesson");
4:
5: function model(docs) {
6:   const matches = (doc, filter) => Object.keys(filter).every((key) => filter[key] == null ? doc[key] == null : String(doc[key]) === String(filter[key]));
7:   return {
8:     docs,
9:     async get(filter = {}) { return { result: docs.filter((doc) => matches(doc, filter)).map((doc) => structuredClone(doc)) }; },
10:     async updateExisting(filter, data) {
11:       const doc = docs.find((row) => matches(row, filter));
12:       if (!doc) return { result: null };
13:       Object.assign(doc, data);
14:       return { result: doc };
15:     },
16:   };
17: }
18:
19: function setup() {
20:   const lessons = model([
21:     { _id: "e1", teacher: "g1", kind: "educational", list_students: ["s9"] },
22:     { _id: "e2", teacher: "g2", kind: "educational", list_students: ["s3"] },
23:     { _id: "r1", teacher: "g1", kind: "regular", list_students: [] },
24:   ]);
25:   const students = model([
26:     { _id: "s1", main_teacher: "g1", status: "عادي" },
27:     { _id: "s2", main_teacher: "g1", status: "ينتظر" },
28:     { _id: "s3", main_teacher: "g2", status: "عادي" },
29:     { _id: "s9", main_teacher: "g1", status: "عادي" },
30:   ]);
31:   return { lessons, students, edu: createEducationalLessons({ lessons, students, now: () => new Date("2026-11-05") }) };
32: }
33:
34: test("every accepted student of the guide joins the educational lesson, once", async () => {
35:   const { edu, lessons } = setup();
36:   assert.equal(await edu.enrolAll("g1"), 1);
37:   assert.deepEqual(lessons.docs[0].list_students, ["s9", "s1"]);
38:   assert.deepEqual(lessons.docs[2].list_students, [], "a regular lesson is left alone");
39:   assert.equal(await edu.enrolAll("g1"), 0);
40: });
41:
42: test("a guide with no educational lesson changes nothing", async () => {
43:   const { edu } = setup();
44:   assert.equal(await edu.enrolAll("nobody"), 0);
45: });
46:
47: test("a student who changes guide moves to the new guide's lesson", async () => {
48:   const { edu, lessons } = setup();
49:   await edu.moveStudent("s3", "g2", "g1");
50:   assert.deepEqual(lessons.docs[1].list_students, []);
51:   assert.deepEqual(lessons.docs[0].list_students, ["s9", "s3"]);
52: });
53:
54: test("an approved request joins; the same guide again adds nothing", async () => {
55:   const { edu, lessons } = setup();
56:   await edu.moveStudent("s2", null, "g1");
57:   assert.deepEqual(lessons.docs[0].list_students, ["s9", "s2"]);
58:   await edu.moveStudent("s2", "g1", "g1");
59:   assert.deepEqual(lessons.docs[0].list_students, ["s9", "s2"]);
60: });
61:
62: test("a guide has one educational lesson: another is reported as taken", async () => {
63:   const { edu } = setup();
64:   assert.equal((await edu.takenBy("g1"))._id, "e1");
65:   assert.equal(await edu.takenBy("g1", "e1"), null);
66:   assert.equal(await edu.takenBy("nobody"), null);
67: });
68:
69: test("simultaneous automatic additions preserve both students using a fresh roster on conflict", async () => {
70:   const { edu, lessons } = setup();
71:   await Promise.all([edu.moveStudent("s1", null, "g1"), edu.moveStudent("s2", null, "g1")]);
72:   assert.deepEqual([...lessons.docs[0].list_students].sort(), ["s1", "s2", "s9"]);
73:   assert.equal(new Set(lessons.docs[0].list_students).size, 3);
74: });
75:
76: test("a competing roster change during automatic removal is preserved", async () => {
77:   const { edu, lessons } = setup();
78:   const update = lessons.updateExisting;
79:   let raced = false;
80:   lessons.updateExisting = async (filter, data) => {
81:     if (!raced) { raced = true; lessons.docs[1].list_students.push("unrelated"); lessons.docs[1].updatedAt = new Date("2026-11-06"); }
82:     return update(filter, data);
83:   };
84:   await edu.moveStudent("s3", "g2", "g1");
85:   assert.deepEqual(lessons.docs[1].list_students, ["unrelated"]);
86: });
87:
88: test("student guide changes request locks for old and new educational programs", async () => {
89:   const { lessons, students } = setup();
90:   const asked = [];
91:   const req = { actor: { id: "staff" } };
92:   const edu = createEducationalLessons({ lessons, students, lockPrograms: async (keys, request) => { asked.push([keys, request]); return async () => {}; } });
93:   await edu.holdForStudentChange("g1", "g2", req);
94:   assert.deepEqual(asked, [[["lesson:e1", "lesson:e2"], req]]);
95: });
96:

SOURCE server/test/student-scope-routes.test.js lines 643-766
643:   });
644: });
645:
646: test("attendance save with nothing to write records no audit row", async () => {
647:   const w = world();
648:   const base = { year: 2026, month: 10, day: 17 };
649:   // Scoped: another guide's lesson is not found; an unknown lesson saves nothing.
650:   const theirs = await call(w.att.bulkSave, reqAs(GUIDE, { body: { ...base, lessonId: "lesson-2", items: [{ studentId: sid(3), status: "غائب" }] } }));
651:   assert.equal(theirs.statusCode, 404);
652:   const unknown = await call(w.att.bulkSave, reqAs(GUIDE, { body: { ...base, lessonId: "lesson-404", items: [{ studentId: sid(3), status: "غائب" }] } }));
653:   assert.equal(unknown.statusCode, 200);
654:   // Admin with an empty list.
655:   const empty = await call(w.att.bulkSave, reqAs(ADMIN, { body: { ...base, lessonId: "lesson-1", items: [] } }));
656:   assert.equal(empty.statusCode, 200);
657:   assert.equal(w.attendance.all().length, 0);
658:   assert.equal(w.audit.calls.length, 0);
659:
660:   const saved = await call(w.att.bulkSave, reqAs(GUIDE, { body: { ...base, lessonId: "lesson-1", items: [{ studentId: sid(1), status: "غائب" }] } }));
661:   assert.equal(saved.statusCode, 200);
662:   assert.equal(w.audit.calls.length, 1);
663:   assert.equal(w.audit.calls[0].after.rowsSaved, 1);
664: });
665:
666: test("a student update stamps updatedAt, announces the change, and refuses a stale baseVersion with 409", async () => {
667:   const w = world();
668:   live.changes.length = 0;
669:   const stale = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[0].tz }, body: { firstname: "A", baseVersion: "2000-01-01T00:00:00.000Z" } }));
670:   // Nothing is stored with an updatedAt yet, so there is nothing to be stale against.
671:   assert.equal(stale.statusCode, 200);
672:   assert.deepEqual(live.changes, [["student", S[0]._id]]);
673:   const saved = w.students.all().find((s) => s._id === S[0]._id);
674:   assert.ok(Number.isFinite(Date.parse(saved.updatedAt)));
675:
676:   live.changes.length = 0;
677:   const behind = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[0].tz }, body: { firstname: "B", baseVersion: "2000-01-01T00:00:00.000Z" } }));
678:   assert.equal(behind.statusCode, 409);
679:   assert.equal(behind.body.code, "STALE");
680:   assert.equal(behind.body.current.firstname, "A");
681:   assert.ok(behind.body.current.updatedByName, "the 409 names the last editor");
682:   assert.deepEqual(live.changes, [], "a refused save announces nothing");
683:   assert.equal(w.students.all().find((s) => s._id === S[0]._id).firstname, "A");
684:
685:   const fresh = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[0].tz }, body: { firstname: "C", baseVersion: new Date(saved.updatedAt).toISOString() } }));
686:   assert.equal(fresh.statusCode, 200);
687: });
688:
689: test("a staff student update tells that student's own sport screen (name or photo may have changed)", async () => {
690:   const w = world();
691:   live.students.length = 0;
692:   const saved = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[0].tz }, body: { firstname: "Renamed" } }));
693:   assert.equal(saved.statusCode, 200);
694:   assert.deepEqual(live.students, [[[S[0]._id], "me"]]);
695: });
696:
697: // Owner, 2026-11-03: one record per ID number. Two saves of the same ID at the
698: // same moment both pass the existence check; the database's unique index then
699: // refuses the second, and the reply is the usual 409, not a 500.
700: const duplicateKey = () => Object.assign(new Error("E11000 duplicate key error collection: Students index: tz_1"), { code: 11000 });
701:
702: test("a new student whose ID number was taken a moment ago gets 409 TZ_EXISTS", async () => {
703:   const w = world();
704:   w.students.create = async () => { throw duplicateKey(); };
705:   const res = await call(w.student.postS, reqAs(ADMIN, { body: { status: "ينتظر", tz: "800000020", firstname: "N", lastname: "Ew" } }));
706:   assert.equal(res.statusCode, 409);
707:   assert.equal(res.body.code, "TZ_EXISTS");
708: });
709:
710: test("changing a student's ID number to one taken a moment ago gets 409 TZ_EXISTS", async () => {
711:   const w = world();
712:   w.students.updateExisting = async () => { throw duplicateKey(); };
713:   const res = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[0].tz }, body: { tz: "800000021" } }));
714:   assert.equal(res.statusCode, 409);
715:   assert.equal(res.body.code, "TZ_EXISTS");
716: });
717:
718:
719: test("a held educational program blocks student creation and approval before either record changes", async () => {
720:   const holder = { name: "Program Holder", tz: "900000099" };
721:   const lockPrograms = async (keys) => {
722:     if (keys.includes("lesson:lesson-1")) throw Object.assign(new Error("program held"), { status: 423, holder });
723:     return async () => {};
724:   };
725:   const w = world({ lockPrograms });
726:   await w.lessons.updateExisting({ _id: "lesson-1" }, { kind: "educational" });
727:   const count = w.students.all().length;
728:   const created = await call(w.student.postS, reqAs(ADMIN, { body: { tz: "new-tz", firstname: "New", lastname: "Child", main_teacher: GUIDE._id } }));
729:   assert.equal(created.statusCode, 423);
730:   assert.deepEqual(plain(created.body.holder), holder);
731:   assert.equal(w.students.all().length, count);
732:   await w.students.updateExisting({ _id: sid(5) }, { status: "ينتظر" });
733:   const accepted = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[4].tz }, body: { status: "عادي", main_teacher: GUIDE._id } }));
734:   assert.equal(accepted.statusCode, 423);
735:   assert.equal(w.students.all().find((s) => s._id === sid(5)).status, "ينتظر");
736:   assert.deepEqual(w.lessons.all()[0].list_students, [sid(1)]);
737: });
738:
739: test("successful approval enrols the student and releases its program lock", async () => {
740:   let released = 0;
741:   const keysHeld = [];
742:   const w = world({ lockPrograms: async (keys) => { keysHeld.push(...keys); return async () => { released += 1; }; } });
743:   await w.lessons.updateExisting({ _id: "lesson-1" }, { kind: "educational" });
744:   await w.students.updateExisting({ _id: sid(5) }, { status: "ينتظر" });
745:   const accepted = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[4].tz }, body: { status: "عادي", main_teacher: GUIDE._id } }));
746:   assert.equal(accepted.statusCode, 200);
747:   assert.ok(keysHeld.includes("lesson:lesson-1"));
748:   assert.equal(released, 1);
749:   assert.ok(w.lessons.all()[0].list_students.includes(sid(5)));
750: });
751:
752: test("manual roster writes refuse a race instead of overwriting a new enrolment", async () => {
753:   for (const action of ["addToList", "removeFromList"]) {
754:     const w = world();
755:     const original = w.lessons.updateExisting;
756:     w.lessons.updateExisting = async (filter, patch) => {
757:       await original({ _id: "lesson-1" }, { list_students: [sid(1), sid(5)], updatedAt: new Date("2026-11-06T12:00:00Z") });
758:       return original(filter, patch);
759:     };
760:     const res = await call(w.lesson[action], reqAs(ADMIN, { params: { id: "lesson-1" }, body: { list_students: [action === "addToList" ? sid(3) : sid(1)] } }));
761:     assert.equal(res.statusCode, 409, action);
762:     assert.equal(res.body.code, "STALE", action);
763:     assert.deepEqual(w.lessons.all()[0].list_students, [sid(1), sid(5)], action);
764:   }
765: });
766:

SOURCE server/test/lock-guard.test.js lines 1-40
1: const assert = require("node:assert/strict");
2: const fs = require("node:fs");
3: const path = require("node:path");
4: const test = require("node:test");
5: const vm = require("node:vm");
6:
7: const { createLockGuard, checkVersion } = require("../middleware/lockGuard");
8: const { holdItemLocks } = require("../middleware/lockGuard");
9:
10: test("program locks are acquired in order; a conflict releases only newly acquired locks", async () => {
11:   const acquired = [], released = [];
12:   const locks = {
13:     async acquire(key, owner) {
14:       acquired.push([key, owner]);
15:       if (key === "lesson:c") return { ok: false, holder: { name: "Other" } };
16:       return { ok: true, created: key !== "lesson:a" };
17:     },
18:     async release(key, clientId) { released.push([key, clientId]); },
19:   };
20:   const req = { get: () => "tab", actor: { id: "staff", name: "Staff" } };
21:   await assert.rejects(() => holdItemLocks(locks, ["lesson:c", "lesson:b", "lesson:a", "lesson:b"], req), (error) => error.status === 423 && error.holder.name === "Other");
22:   assert.deepEqual(acquired.map(([key]) => key), ["lesson:a", "lesson:b", "lesson:c"]);
23:   assert.deepEqual(released, [["lesson:b", "tab"]]);
24: });
25:
26: test("program locks remain held for the write and are released on completion", async () => {
27:   const released = [];
28:   const release = await holdItemLocks({ acquire: async () => ({ ok: true, created: true }), release: async (key) => released.push(key) }, ["lesson:b", "lesson:a"], { get: () => "tab", actor: { id: "staff" } });
29:   assert.deepEqual(released, []);
30:   await release();
31:   assert.deepEqual(released, ["lesson:b", "lesson:a"]);
32: });
33:
34: /* ================= the guard itself ================= */
35: const HOLDER = { name: "Holder Name", tz: "900000001" };
36:
37: // A fake lock service: `held` maps key -> { clientId, ...holder }.
38: function fakeLocks(held = {}) {
39:   const asked = [];
40:   return {

SOURCE apps/system/src/Components/Student/RegistrationConsent.test.js lines 1-106
1: import React, { act, useState } from "react";
2: import { createRoot } from "react-dom/client";
3: import { Simulate } from "react-dom/test-utils";
4: import EditStudent from "./EditStudent";
5: import RegistrationConsent from "./RegistrationConsent";
6: import ConsentView from "./ConsentView";
7: import { validate, submit, getConsent, getRules, signConsent } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
8:
9: jest.mock("react-router-dom", () => ({ useParams: () => ({ token: "registration-token" }), useNavigate: () => jest.fn() }), { virtual: true });
10: jest.mock("../../WebServer/services/inviteToken/functionInviteToken.jsx", () => ({ validate: jest.fn(), submit: jest.fn(), getConsent: jest.fn(), getRules: jest.fn(), signConsent: jest.fn() }));
11: jest.mock("../../WebServer/services/student/functionsStudent.jsx", () => ({ getOne: jest.fn(), create: jest.fn(), update: jest.fn() }));
12: jest.mock("../../WebServer/services/user/functionsUser.jsx", () => ({ getAll: jest.fn() }));
13: jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
14: jest.mock("../../i18n/I18nContext", () => ({ useI18n: () => ({ t: (key) => key }) }));
15: jest.mock("../../utils/session", () => ({ canStored: () => false }));
16: jest.mock("../../locks/useItemLock", () => () => ({ status: "held" }));
17: jest.mock("../../locks/LockLostBanner", () => ({ useLockRecovery: () => ({ element: null }) }));
18: jest.mock("./SignaturePad", () => ({ onChange }) => <button type="button" data-testid="signature-pad" onClick={() => onChange("drawn-png")}>ارسم الختم</button>);
19:
20: globalThis.IS_REACT_ACT_ENVIRONMENT = true;
21: let host, root;
22: const rules = { version: 0, text: "قوانين الاختبار" };
23: const button = (text) => [...host.querySelectorAll("button")].find((node) => node.textContent === text);
24: const mount = (element) => act(async () => root.render(element));
25: const click = (text) => act(async () => button(text).click());
26: const change = (selector, value) => act(async () => {
27:   const node = host.querySelector(selector);
28:   Simulate.change(node, { target: { name: node.name, value } });
29: });
30: beforeEach(() => {
31:   jest.clearAllMocks();
32:   host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
33:   validate.mockResolvedValue({ valid: true, open: true, rules });
34:   submit.mockResolvedValue({ ok: true });
35:   getRules.mockResolvedValue({ ok: true, rules });
36: });
37: afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
38:
39: test("registration places its laws link after the photo; agreement/name enable submission without a stamp", async () => {
40:   await mount(<EditStudent parent />);
41:   const photo = [...host.querySelectorAll("label")].find((node) => node.textContent === "صورة الطالب:");
42:   expect(photo.compareDocumentPosition(button("قوانين الجمعية")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
43:   expect(button("إرسال الطلب").disabled).toBe(true);
44:   await click("قوانين الجمعية");
45:   expect(host.querySelector('[role="dialog"]').textContent).toContain(rules.text);
46:   await change('[name="signerName"]', "Parent");
47:   await click("أوافق على القوانين");
48:   await click("حفظ والعودة إلى الطلب");
49:   expect(button("إرسال الطلب").disabled).toBe(false);
50:   expect(host.textContent).toContain("التوقيع/الختم مطلوب");
51:   for (const [name, value] of Object.entries({ tz: "123456782", firstname: "Child", lastname: "Family", birth_date: "2015-03-01", gender: "ذكر", street: "Street" })) await change(`[name="${name}"]`, value);
52:   await click("إرسال الطلب");
53:   expect(submit).toHaveBeenCalledWith("registration-token", expect.objectContaining({ rulesVersion: 0, rulesAccepted: "true", signerName: "Parent", signature: "" }), null);
54: });
55:
56: test("a changed rules version clears consent and prevents sending until the new version is accepted", async () => {
57:   submit.mockResolvedValue({ ok: false, code: "RULES_CHANGED", message: "Changed" });
58:   await mount(<EditStudent parent />);
59:   await click("قوانين الجمعية"); await change('[name="signerName"]', "Parent"); await click("أوافق على القوانين"); await click("ارسم الختم"); await click("حفظ والعودة إلى الطلب");
60:   for (const [name, value] of Object.entries({ tz: "123456782", firstname: "Child", lastname: "Family", birth_date: "2015-03-01", gender: "ذكر", street: "Street" })) await change(`[name="${name}"]`, value);
61:   validate.mockResolvedValue({ valid: true, open: true, rules: { version: 1, text: "New rules" } });
62:   await click("إرسال الطلب");
63:   expect(button("إرسال الطلب").disabled).toBe(true);
64:   await click("قوانين الجمعية");
65:   expect(host.querySelector('[role="dialog"]').textContent).toContain("New rules");
66:   expect(button("أوافق على القوانين").getAttribute("aria-pressed")).toBe("false");
67: });
68:
69: test("dialog preserves drawn evidence when reopened, disagreement clears acceptance, and keyboard focus stays inside", async () => {
70:   function Harness() {
71:     const [value, setValue] = useState({ accepted: false, signerName: "Parent", signature: "" });
72:     return <RegistrationConsent rules={rules} value={value} onChange={setValue} />;
73:   }
74:   await mount(<Harness />);
75:   await click("قوانين الجمعية"); await click("أوافق على القوانين"); await click("ارسم الختم");
76:   expect(button("ارسم الختم")).toBeDefined(); // A stroke does not destroy the canvas.
77:   await click("حفظ والعودة إلى الطلب"); await click("قوانين الجمعية");
78:   expect(host.querySelector('img[alt="توقيع/ختم ولي الأمر"]').getAttribute("src")).toBe("drawn-png");
79:   await click("لا أوافق");
80:   const dialog = host.querySelector('[role="dialog"]');
81:   const first = dialog.querySelector("button");
82:   const last = button("حفظ والعودة إلى الطلب");
83:   last.focus();
84:   await act(async () => Simulate.keyDown(dialog, { key: "Tab", preventDefault: jest.fn() }));
85:   expect(document.activeElement).toBe(first);
86:   await act(async () => Simulate.keyDown(dialog, { key: "Escape", preventDefault: jest.fn() }));
87:   expect(host.querySelector('[role="dialog"]')).toBeNull();
88:   expect(document.activeElement).toBe(button("قوانين الجمعية"));
89:   expect(host.textContent).toContain("يجب قراءة القوانين والموافقة");
90:   expect(document.body.style.overflow).toBe("");
91: });
92:
93: test("pending consent is shown as incomplete and can be completed on the student's page", async () => {
94:   getConsent.mockResolvedValueOnce({ ok: true, consent: { signerName: "Parent", acceptedAt: "2026-11-06", signature: null } })
95:     .mockResolvedValueOnce({ ok: true, consent: { signerName: "Parent", signedAt: "2026-11-06", signature: "drawn-png", rulesText: rules.text, rulesVersion: 0 } });
96:   signConsent.mockResolvedValue({ ok: true });
97:   await mount(<ConsentView studentId="student" />);
98:   expect(host.textContent).toContain("لم يُستكمل بعد");
99:   expect(host.querySelector("img")).toBeNull();
100:   expect(host.querySelector("#consent-signer").value).toBe("Parent");
101:   await act(async () => Simulate.change(host.querySelector('input[type="checkbox"]'), { target: { checked: true } }));
102:   await click("ارسم الختم"); await click("حفظ التوقيع");
103:   expect(signConsent).toHaveBeenCalledWith("student", expect.objectContaining({ rulesAccepted: "true", signature: "drawn-png" }));
104:   expect(host.querySelector('img[alt="توقيع ولي الأمر"]')).not.toBeNull();
105: });
106:

SOURCE apps/system/src/Components/Lesson/LessonRoster.lock.test.js lines 1-54
1: import React, { act } from "react";
2: import { createRoot } from "react-dom/client";
3: import LessonRoster from "./LessonRoster";
4: import api from "../../WebServer/services/api";
5:
6: jest.mock("react-router-dom", () => ({ Link: ({ children }) => <span>{children}</span> }), { virtual: true });
7: jest.mock("../../i18n/I18nContext", () => ({ useI18n: () => ({ t: (key) => key }) }));
8: jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn() } }));
9: jest.mock("../../WebServer/services/student/functionsStudent", () => ({ lookupStudent: jest.fn() }));
10: jest.mock("../../WebServer/services/api", () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() }, API_BASE_URL: "/api", getAuthToken: () => "fake" }));
11: jest.mock("../../journey/demoMode", () => ({ isDemo: () => false }));
12: globalThis.IS_REACT_ACT_ENVIRONMENT = true;
13: let root, host;
14: const button = (text) => [...host.querySelectorAll("button")].find((node) => node.textContent === text);
15: const mount = (props = {}) => act(async () => root.render(<LessonRoster lesson={{ _id: "program-a", list_students: [] }} students={[{ _id: "student", firstname: "Child" }]} allLessons={[]} canEdit onChange={jest.fn()} confirmRemove={jest.fn()} {...props} />));
16: beforeEach(() => {
17:   jest.clearAllMocks(); api.post.mockResolvedValue({ data: { ok: true } });
18:   host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
19: });
20: afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
21:
22: test("the add window holds the program while choosing students and releases it when closed", async () => {
23:   await mount();
24:   expect(api.post).not.toHaveBeenCalled();
25:   await act(async () => button("+ إضافة طالب").click());
26:   expect(api.post).toHaveBeenCalledWith("/locks/acquire", { key: "lesson:program-a" });
27:   expect(button("إضافة")).toBeDefined();
28:   expect(api.post.mock.calls.filter(([path]) => path === "/locks/release")).toHaveLength(0);
29:   await act(async () => button("تم").click());
30:   expect(api.post).toHaveBeenCalledWith("/locks/release", { key: "lesson:program-a" });
31: });
32:
33: test("a held program shows the other holder and offers no addition until released", async () => {
34:   api.post.mockImplementation(async (path) => {
35:     if (path === "/locks/acquire") throw { response: { status: 423, data: { holder: { name: "Other User", tz: "900000001" } } } };
36:     return { data: { ok: true } };
37:   });
38:   const onChange = jest.fn();
39:   await mount({ onChange });
40:   await act(async () => button("+ إضافة طالب").click());
41:   expect(host.querySelector('[role="dialog"]').textContent).toContain("مفتوح الآن لدى Other User (900000001)");
42:   expect(button("إضافة")).toBeUndefined();
43:   expect(onChange).not.toHaveBeenCalled();
44:   await act(async () => button("تم").click());
45:   expect(api.post.mock.calls.filter(([path]) => path === "/locks/release")).toHaveLength(0);
46: });
47:
48: test("a lesson edit form reuses its surrounding lock without taking/releasing a second one", async () => {
49:   await mount({ confirmRemove: undefined });
50:   await act(async () => button("+ إضافة طالب").click());
51:   await act(async () => button("تم").click());
52:   expect(api.post).not.toHaveBeenCalled();
53: });
54:

FINAL HANDOFF SUPPLEMENT: dedicated actual Claude invocation returned its weekly-limit message (resets Nov 8, 16:00 Asia/Jerusalem). No review findings or agreement were received. The following test-runner compatibility adjustment was made while verifying: Jest 27 needs the installed Router 7 ./dom export mapped explicitly to its documented CommonJS target, and jsdom needs encoding globals. This is test-only configuration; no dependency upgrade or production routing change. Final npm run verify result is recorded separately in AI_REVIEW_LOG.md.

SOURCE apps/system/package.json
42:   "jest": {
43:     "moduleNameMapper": {
44:       "^react-router/dom$": "<rootDir>/node_modules/react-router/dist/development/dom-export.js"
45:     },
46:     "transformIgnorePatterns": [
47:       "node_modules/(?!(@dicebear)/)"
48:     ]
49:   },
50:   "proxy": "http://localhost:5000",
51:   "browserslist": {

SOURCE apps/system/src/setupTests.js
1: // Tests currently use Jest's built-in assertions; no extra matchers are required.
2: // CRA's Jest 27/jsdom does not provide the encoding globals used by Router 7.
3: const { TextEncoder, TextDecoder } = require("util");
4: if (!global.TextEncoder) global.TextEncoder = TextEncoder;
5: if (!global.TextDecoder) global.TextDecoder = TextDecoder;
6:

SOURCE server/test/student-scope-routes.test.js
719: test("a held educational program blocks student creation and approval before either record changes", async () => {
720:   const holder = { name: "Program Holder", tz: "900000099" };
721:   const lockPrograms = async (keys) => {
722:     if (keys.includes("lesson:lesson-1")) throw Object.assign(new Error("program held"), { status: 423, holder });
723:     return async () => {};
724:   };
725:   const w = world({ lockPrograms });
726:   await w.lessons.updateExisting({ _id: "lesson-1" }, { kind: "educational" });
727:   const count = w.students.all().length;
728:   const created = await call(w.student.postS, reqAs(ADMIN, { body: { tz: "new-tz", firstname: "New", lastname: "Child", main_teacher: GUIDE._id } }));
729:   assert.equal(created.statusCode, 423);
730:   assert.deepEqual(plain(created.body.holder), holder);
731:   assert.equal(w.students.all().length, count);
732:   await w.students.updateExisting({ _id: sid(5) }, { status: "ينتظر" });
733:   const accepted = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[4].tz }, body: { status: "عادي", main_teacher: GUIDE._id } }));
734:   assert.equal(accepted.statusCode, 423);
735:   assert.equal(w.students.all().find((s) => s._id === sid(5)).status, "ينتظر");
736:   assert.deepEqual(w.lessons.all()[0].list_students, [sid(1)]);
737: });
738:
739: test("successful approval enrols the student and releases its program lock", async () => {
740:   let released = 0;
741:   const keysHeld = [];
742:   const w = world({ lockPrograms: async (keys) => { keysHeld.push(...keys); return async () => { released += 1; }; } });
743:   await w.lessons.updateExisting({ _id: "lesson-1" }, { kind: "educational" });
744:   await w.students.updateExisting({ _id: sid(5) }, { status: "ينتظر" });
745:   const accepted = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[4].tz }, body: { status: "عادي", main_teacher: GUIDE._id } }));
746:   assert.equal(accepted.statusCode, 200);
747:   assert.ok(keysHeld.includes("lesson:lesson-1"));
748:   assert.equal(released, 1);
749:   assert.ok(w.lessons.all()[0].list_students.includes(sid(5)));
750: });
751:
752: test("manual roster writes refuse a race instead of overwriting a new enrolment", async () => {
753:   for (const action of ["addToList", "removeFromList"]) {
754:     const w = world();
755:     const original = w.lessons.updateExisting;
756:     w.lessons.updateExisting = async (filter, patch) => {
757:       await original({ _id: "lesson-1" }, { list_students: [sid(1), sid(5)], updatedAt: new Date("2026-11-06T12:00:00Z") });
758:       return original(filter, patch);
759:     };
760:     const res = await call(w.lesson[action], reqAs(ADMIN, { params: { id: "lesson-1" }, body: { list_students: [action === "addToList" ? sid(3) : sid(1)] } }));
761:     assert.equal(res.statusCode, 409, action);
762:     assert.equal(res.body.code, "STALE", action);
763:     assert.deepEqual(w.lessons.all()[0].list_students, [sid(1), sid(5)], action);
764:   }
765: });
766:

FINAL LOCAL VERIFICATION: npm run verify passed with Git Bash: 1,483 server tests, 1,086 System tests in 125 suites, optimized System production build. Changed production server syntax and git diff --check passed. No real database, mail, browser/phone flow, commit, push or deployment. Independent review remains pending; no agreement is claimed.
