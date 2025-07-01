"use client";
import { useEffect, useState, useContext } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firestore";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { motion } from "framer-motion";
// @ts-ignore
import { ThemeContext } from "../../../../theme-context";
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
  const [event, setEvent] = useState<any>(null);
  const [group, setGroup] = useState<any>(null);
  const [paids, setPaids] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [round, setRound] = useState("round");
  const [memo, setMemo] = useState("");
  const [extras, setExtras] = useState<(number|null)[]>([]);
  const [individualShares, setIndividualShares] = useState<{[key: number]: number}>({});
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const router = useRouter();
  const { themeIdx } = useContext(ThemeContext) as { themeIdx: number };

  // イベント・グループ情報取得
  useEffect(() => {
    if (!groupId || !eventId) return;
    const unsub = onSnapshot(doc(db, "groups", groupId), (snap) => {
      setGroup(snap.exists() ? { id: groupId, ...snap.data() } : null);
    });
    return () => unsub();
  }, [groupId]);

  useEffect(() => {
    if (!groupId || !eventId) return;
    const unsub = onSnapshot(doc(db, "groups", groupId, "events", eventId), (snap) => {
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
      }
    });
    return () => unsub();
  }, [groupId, eventId]);

  if (loading) return <div className="p-10 text-center">Loading...</div>;
  if (!event || !group) return <div className="p-10 text-center">イベントが見つかりません</div>;

  // 参加者はグループメンバーで固定
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

  // 入力変更時にFirestoreへ保存
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

  // 割り勘計算・結果保存
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

  // シェア用テキスト
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
}