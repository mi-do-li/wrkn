"use client";
import { useEffect, useState, useContext } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firestore";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { motion } from "framer-motion";
// @ts-ignore
import { ThemeContext } from "@/app/theme-context";
import Link from "next/link";

const THEMES = [
  { name: "Sweet", bg: "from-pink-200 via-blue-200 to-purple-200" },
  { name: "Sunset", bg: "from-yellow-200 via-pink-200 to-red-200" },
  { name: "Mint", bg: "from-green-200 via-teal-200 to-blue-200" },
];

const ROUND_OPTIONS = [
  { label: "切り捨て", value: "floor" },
  { label: "切り上げ", value: "ceil" },
  { label: "四捨五入", value: "round" },
];

// GlassCardをインラインで定義
function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`backdrop-blur-2xl bg-white/30 dark:bg-white/10 border border-white/40 dark:border-white/20 shadow-2xl rounded-[2.5rem] p-10 ${className}`}
      style={{ boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.18)", border: "1px solid rgba(255,255,255,0.18)" }}
    >
      {children}
    </div>
  );
}

function calcSplit(total: number, people: number, round: string, extras: (number|null)[], individualShares: {[key: number]: number} = {}) {
  if (people <= 0) return { per: 0, details: [] };
  const hasIndividualShares = Object.keys(individualShares).length > 0;
  if (hasIndividualShares) {
    const totalShare = Object.values(individualShares).reduce((sum, share) => sum + share, 0);
    if (totalShare === 0) return { per: 0, details: Array(people).fill(0) };
    const details = Array(people).fill(0).map((_, i) => {
      const share = individualShares[i] || 0;
      return Math[round as "floor" | "ceil" | "round"]((total * share) / totalShare);
    });
    const calculatedTotal = details.reduce((sum, amount) => sum + amount, 0);
    if (calculatedTotal !== total) {
      const diff = total - calculatedTotal;
      details[0] += diff;
    }
    return { per: details[0], details };
  }
  const fixed = extras.map((v, i) => ({ idx: i, value: v })).filter(x => x.value !== null && x.value > 0);
  const restPeople = people - fixed.length;
  const restTotal = total - fixed.reduce((a, b) => a + (b.value ?? 0), 0);
  let per = restPeople > 0 ? Math[round as "floor" | "ceil" | "round"](restTotal / restPeople) : 0;
  let details = Array(people).fill(0).map((_, i) => (extras[i] !== null && extras[i]! > 0 ? extras[i]! : per));
  return { per, details };
}

function calcSettlement(details: number[], paids: (number|null)[]) {
  const n = details.length;
  const balances = paids.map((paid, i) => (paid ?? 0) - details[i]);
  const settlements: { from: number; to: number; amount: number }[] = [];
  let debtors = balances.map((b, i) => ({ idx: i, bal: b })).filter(x => x.bal < -1e-2).sort((a, b) => a.bal - b.bal);
  let creditors = balances.map((b, i) => ({ idx: i, bal: b })).filter(x => x.bal > 1e-2).sort((a, b) => b.bal - a.bal);
  while (debtors.length && creditors.length) {
    const d = debtors[0], c = creditors[0];
    const amt = Math.min(-d.bal, c.bal);
    settlements.push({ from: d.idx, to: c.idx, amount: Math.round(amt) });
    d.bal += amt;
    c.bal -= amt;
    if (Math.abs(d.bal) < 1e-2) debtors.shift();
    if (Math.abs(c.bal) < 1e-2) creditors.shift();
  }
  return settlements;
}

function AnimatedParticles({ themeIdx = 0 }: { themeIdx?: number }) {
  const colorSets = [
    ["#f472b6", "#60a5fa", "#a78bfa"],
    ["#fbbf24", "#f472b6", "#f87171"],
    ["#6ee7b7", "#38bdf8", "#818cf8"],
  ];
  const colors = colorSets[themeIdx % colorSets.length];
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {[...Array(10)].map((_, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full opacity-60 blur-2xl animate-pulse`}
          style={{
            width: `${60 + Math.random() * 80}px`,
            height: `${60 + Math.random() * 80}px`,
            left: `${Math.random() * 90}%`,
            top: `${Math.random() * 90}%`,
            background: `linear-gradient(135deg, ${colors[i%3]} 0%, ${colors[(i+1)%3]} 100%)`,
            animationDuration: `${2 + Math.random() * 3}s`,
          }}
          animate={{ y: [0, 20, -20, 0] }}
          transition={{ repeat: Infinity, duration: 6 + i, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export default function EventPage() {
  const { groupId, eventId } = useParams<{ groupId: string; eventId: string }>();
  const router = useRouter();
  let themeIdx = 0;
  try {
    themeIdx = useContext(ThemeContext).themeIdx;
  } catch (e) {
    console.error("ThemeContext error", e);
    themeIdx = 0;
  }
  const [group, setGroup] = useState<any>(null);
  const [event, setEvent] = useState<any>(null);
  const [paids, setPaids] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [round, setRound] = useState("round");
  const [memo, setMemo] = useState("");
  const [extras, setExtras] = useState<(number|null)[]>([]);
  const [individualShares, setIndividualShares] = useState<{[key: number]: number}>({});
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (!groupId || !eventId) return;
    const unsubGroup = onSnapshot(doc(db, "groups", groupId), (snap) => {
      setGroup(snap.exists() ? { id: groupId, ...snap.data() } : null);
    }, err => setError(err.message || String(err)));
    const unsubEvent = onSnapshot(doc(db, "groups", groupId, "events", eventId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setEvent({ id: eventId, ...data });
        setPaids((data.participants||[]).map((m:any)=>String((data.payments?.[m.id] ?? ""))));
        setTotal(data.total ?? 0);
        setMemo(data.memo ?? "");
        setRound(data.round ?? "round");
        setExtras(data.extras ?? Array((data.participants?.length)||0).fill(null));
        setIndividualShares(data.individualShares ?? {});
        setResult(data.result || null);
        setLoading(false);
      } else {
        setEvent(null);
        setLoading(false);
      }
    }, err => setError(err.message || String(err)));
    return () => { unsubGroup(); unsubEvent(); };
  }, [groupId, eventId]);

  if (loading) return <div className="p-10 text-center">Loading...</div>;
  if (error) return <div className="p-10 text-center text-red-500">エラー: {error}</div>;
  if (!event || !group) return <div className="p-10 text-center">イベントが見つかりません</div>;

  const members = group.members || [];
  const names = members.map((m:any)=>m.name);
  const people = names.length;
  const paidsNum = paids.map(p => p === "" ? null : Number(p));
  const { per, details } = calcSplit(
    total,
    people,
    round,
    extras,
    individualShares
  );
  const settlements = calcSettlement(details, paidsNum);

  const handlePaymentChange = async (idx: number, value: string) => {
    const newPaids = [...paids];
    newPaids[idx] = value;
    setPaids(newPaids);
    // Firestore保存
    const newPayments: { [uid: string]: number } = {};
    members.forEach((m:any, i:number) => {
      newPayments[m.id] = Number(newPaids[i] || 0);
    });
    await updateDoc(doc(db, "groups", groupId, "events", eventId), {
      payments: newPayments,
    });
  };

  const handleCalc = async () => {
    await updateDoc(doc(db, "groups", groupId, "events", eventId), {
      participants: members,
      total,
      memo,
      round,
      extras,
      individualShares,
      result: { details, settlements, total, per },
      notify: true, // 通知用フラグ
    });
    setShowResult(true);
  };

  const shareText = paidsNum.some((v)=>v!==null && v>0)
    ? `【割り勘計算】\n${people}人で${total}円\n${memo ? "用途: " + memo + "\n" : ""}${paidsNum.map((paid,i)=>`${names[i]}: ${paid ?? 0}円支払済み`).join("\n")}\n${settlements.length > 0 ? `\n【送金ルート】\n${settlements.map(s=>`${names[s.from]} → ${names[s.to]}: ${s.amount}円`).join("\n")}` : "\n精算不要です"}`
    : `【割り勘計算】\n${people}人で${total}円\n1人あたり: ${per}円\n${details.map((d,i)=>`${names[i]}:${d}円`).join(" ")}\n${memo ? "用途: " + memo : ""}`;

  const share = () => {
    navigator.clipboard.writeText(shareText);
    alert("クリップボードにコピーしました！");
  };
  const shareLine = () => {
    const url = `https://line.me/R/msg/text/?${encodeURIComponent(shareText)}`;
    window.open(url, "_blank");
  };
  const exportCSV = () => {
    const csv = paidsNum.some((v)=>v!==null && v>0)
      ? [
          ["項目", "内容"],
          ["人数", people],
          ["合計金額", `${total}円`],
          ["用途", memo],
          ["", ""],
          ["支払済み状況", ""],
          ...paidsNum.map((paid,i)=>[`${names[i]}`, `${paid ?? 0}円`]),
          ["", ""],
          ["送金ルート", ""],
          ...(settlements.length > 0 
            ? settlements.map(s=>[`${names[s.from]} → ${names[s.to]}`, `${s.amount}円`])
            : [["精算不要", "全員の支払いが一致しています"]]
          )
        ]
      : [
          ["項目", "内容"],
          ["人数", people],
          ["合計金額", `${total}円`],
          ["1人あたり", `${per}円`],
          ["用途", memo],
          ["", ""],
          ["各人負担額", ""],
          ...details.map((d,i)=>[`${names[i]}`, `${d}円`])
        ];
    const csvText = csv.map(row=>row.join(",")).join("\n");
    const blob = new Blob([csvText], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "warikan.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`relative min-h-screen flex flex-col items-center py-10 px-4 bg-gradient-to-br ${THEMES[themeIdx].bg} overflow-hidden`}>
      <AnimatedParticles themeIdx={themeIdx} />
      <button
        className="fixed top-6 left-6 z-20 px-4 py-2 rounded-full bg-white/80 text-gray-700 font-bold shadow hover:scale-105 transition-all"
        onClick={() => router.push(`/group/${groupId}`)}
      >← グループへ戻る</button>
      <div className="w-full flex flex-col items-center gap-8 z-10">
        <GlassCard className="w-full max-w-2xl mb-8 flex flex-col gap-4 items-center">
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2">イベント: {event.name || "(名称未設定)"}</h1>
          <div className="w-full flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="font-bold text-lg">合計金額</label>
              <input type="number" value={total} onChange={e=>setTotal(Number(e.target.value))} className="rounded-xl px-4 py-3 border border-white/40 bg-white/60 focus:outline-none text-2xl font-bold w-full text-center" placeholder="合計金額を入力" />
            </div>
            <div className="flex flex-col sm:flex-row gap-4 w-full justify-between items-center">
              <div className="flex-1">
                <div className="mb-2">メモ: <input type="text" value={memo} onChange={e=>setMemo(e.target.value)} className="rounded-xl px-3 py-1 border border-white/40 bg-white/60 focus:outline-none text-base w-full" /></div>
              </div>
              <div className="flex-1">
                <div className="mb-2">端数処理: <select value={round} onChange={e=>setRound(e.target.value)} className="rounded-xl px-3 py-1 border border-white/40 bg-white/60 focus:outline-none text-base">
                  {ROUND_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select></div>
              </div>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="w-full max-w-2xl mb-8">
          <h2 className="text-xl font-bold mb-2">参加者ごとの支払状況</h2>
          <div className="flex flex-col gap-4">
            {members.map((m: any, i: number) => (
              <div key={m.id} className="flex flex-col sm:flex-row items-center gap-3 bg-white/60 dark:bg-white/10 rounded-2xl p-4 shadow-md w-full">
                <span className="w-24 font-semibold text-base">{m.name}</span>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="number"
                    min={0}
                    value={paids[i]||""}
                    onChange={e=>handlePaymentChange(i, e.target.value)}
                    className="rounded-xl px-4 py-3 border border-white/40 bg-white/80 focus:outline-none text-base w-32 min-w-0 font-semibold"
                    placeholder="支払済み"
                  />
                  <span className="text-sm text-gray-500">円支払</span>
                  <button
                    type="button"
                    className="ml-1 px-4 py-2 rounded-full bg-gradient-to-r from-pink-300 via-blue-300 to-purple-300 text-white text-sm font-bold shadow hover:scale-105 transition-all"
                    onClick={() => {
                      const others = paids.map((v, idx) => idx !== i ? Number(v) || 0 : 0).reduce((a, b) => a + b, 0);
                      const remain = Math.max(total - others, 0);
                      const arr = [...paids]; arr[i] = remain ? String(remain) : ""; setPaids(arr);
                      handlePaymentChange(i, remain ? String(remain) : "");
                    }}
                  >残り全額</button>
                </div>
                <input
                  type="number"
                  value={extras[i]??""}
                  onChange={e=>{const arr=[...extras];arr[i]=e.target.value===""?null:Number(e.target.value);setExtras(arr);}}
                  className="rounded-xl px-2 py-1 border border-white/40 bg-white/60 w-24 ml-2"
                  placeholder="追加負担(任意)"
                />
              </div>
            ))}
          </div>
          <button onClick={handleCalc} className="mt-4 px-8 py-3 rounded-full bg-gradient-to-r from-pink-400 via-blue-400 to-purple-400 text-white font-bold shadow-lg hover:scale-105 transition-transform text-lg">割り勘計算する</button>
        </GlassCard>
        {(showResult || (result && details.length > 0)) && (
          <GlassCard className="w-full max-w-2xl text-center mb-8">
            <h2 className="text-2xl font-bold mb-4">割り勘結果</h2>
            <div className="mb-2 text-lg">1人あたり <span className="font-extrabold text-2xl">{per}</span> 円</div>
            <div className="mb-2">{details.map((d: number, i: number)=>(<span key={i} className="inline-block mx-1 px-2 py-1 rounded-full bg-white/50 text-gray-700 text-sm">{names[i]}: {d}円</span>))}</div>
            <div className="mb-2">送金ルート:</div>
            <ul className="mb-2">
              {settlements.length > 0 ? settlements.map((s: any,i: number)=>(<li key={i}>{names[s.from]} → {names[s.to]} : {s.amount}円</li>)) : <li>精算不要です</li>}
            </ul>
            <div className="flex gap-2 mt-4 justify-center flex-wrap">
              <button onClick={share} className="px-6 py-2 rounded-full bg-white/70 text-gray-900 font-bold shadow hover:scale-105 transition-all">シェア</button>
              <button onClick={shareLine} className="px-6 py-2 rounded-full bg-white/70 text-gray-900 font-bold shadow hover:scale-105 transition-all">LINE共有</button>
              <button onClick={exportCSV} className="px-6 py-2 rounded-full bg-white/70 text-gray-900 font-bold shadow hover:scale-105 transition-all">CSV出力</button>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}