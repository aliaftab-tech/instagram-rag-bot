# 💡 Product & Engineering Ideas

Yeh file project ke future ideas, feature proposals aur enhancements track karne ke liye hai. Core setup complete hone ke baad hum in par discuss kar ke implement karein ge.

---

## 1. Conversational Memory via Supabase Sessions
- **Description:** Instagram DMs mein previous conversation context carry forward karne ke liye sender ID ke mutabiq recent messages Supabase mein store karna.
- **Why:** Abhi bot har message ko isolated query ke tor par treat karta hai. Memory hone se user ke follow-up questions ("aur iski pricing kya hai?", "kitna time lagay ga?") naturally answer hon ge.
- **Effort:** M

---

## 2. Webhook Dead-Letter & Async Background Queue
- **Description:** Webhook handler ko synchronous processing se hata kar Upstash QStash ya async worker queue par shift karna.
- **Why:** Meta ka webhook timeout 20 seconds hota hai. High traffic ya LLM delay ki surat mein Meta requests retry karta hai, jis se duplicate replies ya missed messages ka risk hota hai.
- **Effort:** M

---

## 3. Lead Capture & WhatsApp Handoff
- **Description:** Jab user pricing, booking ya project details discuss kar raha ho toh AI us se email/phone number maang kar Supabase `leads` table mein save kare aur directly WhatsApp direct link share kare.
- **Why:** Social media enquiries ko direct qualified client leads mein convert karta hai.
- **Effort:** S

---

## 4. One-Command DB & Integration Healthcheck Script
- **Description:** Ek CLI tool (`npm run healthcheck`) jo Supabase connection, vector dimensions (2048), table status, NVIDIA embeddings, aur Meta tokens ek click mein verify kar ke report de.
- **Why:** Deployment se pehle ya issues debug karte waqt instant status check mil jata hai.
- **Effort:** S

---

## 5. Admin Ingestion & Knowledge Base Dashboard
- **Description:** App ke status page par ek lightweight protected dashboard jahan portfolio re-scraping trigger ho sake, ingested chunks preview hon, aur custom FAQ add/edit/delete kiye ja sakein.
- **Why:** FAQ update karne ya portfolio re-scrape karne ke liye terminal command chalane ki zaroorat nahi rehti.
- **Effort:** M
