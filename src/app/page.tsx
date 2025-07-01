"use client";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useContext } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { auth, provider, signInWithPopup, signOut } from "../lib/firebase";
import { createGroup as createGroupFirestore, joinGroup, getGroup, deleteGroupWithEvents, getEvents, deleteEventDoc } from "../lib/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";
import Link from "next/link";
import { ThemeContext } from "./theme-context";

const THEMES = [
  {
    name: "Sweet",
    bg: "from-pink-200 via-blue-200 to-purple-200",
  },
  {
    name: "Sunset",
    bg: "from-yellow-200 via-pink-200 to-red-200",
  },
  {
    name: "Mint",
    bg: "from-green-200 via-teal-200 to-blue-200",
  },
];

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

function AnimatedParticles({ themeIdx }: { themeIdx: number }) {
  // テーマごとに色を変える
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

const ROUND_OPTIONS = [
  { label: "切り捨て", value: "floor" },
  { label: "切り上げ", value: "ceil" },
  { label: "四捨五入", value: "round" },
];

const CURRENCIES = [
  { code: "JPY", symbol: "¥", name: "日本円", rate: 1 },
  { code: "USD", symbol: "$", name: "米ドル", rate: 0.0067 },
  { code: "EUR", symbol: "€", name: "ユーロ", rate: 0.0062 },
  { code: "GBP", symbol: "£", name: "ポンド", rate: 0.0053 },
  { code: "KRW", symbol: "₩", name: "韓国ウォン", rate: 8.9 },
  { code: "CNY", symbol: "¥", name: "人民元", rate: 0.048 },
];

const PAYMENT_METHODS = [
  { id: "cash", name: "現金", icon: "💵", qrType: "none" },
  { id: "credit", name: "クレジットカード", icon: "💳", qrType: "none" },
  { id: "paypay", name: "PayPay", icon: "📱", qrType: "paypay" },
  { id: "linepay", name: "LINE Pay", icon: "💚", qrType: "linepay" },
  { id: "venmo", name: "Venmo", icon: "💙", qrType: "venmo" },
  { id: "paypal", name: "PayPal", icon: "🔵", qrType: "paypal" },
  { id: "other", name: "その他", icon: "💸", qrType: "none" },
];

const TIP_OPTIONS = [
  { label: "チップなし", value: 0 },
  { label: "5%", value: 0.05 },
  { label: "10%", value: 0.1 },
  { label: "15%", value: 0.15 },
  { label: "20%", value: 0.2 },
];

const CATEGORIES = [
  { id: "food", name: "食事", icon: "🍽️", color: "from-orange-400 to-red-400" },
  { id: "travel", name: "旅行", icon: "✈️", color: "from-blue-400 to-purple-400" },
  { id: "entertainment", name: "エンタメ", icon: "🎬", color: "from-purple-400 to-pink-400" },
  { id: "shopping", name: "買い物", icon: "🛍️", color: "from-green-400 to-blue-400" },
  { id: "transport", name: "交通", icon: "🚗", color: "from-gray-400 to-blue-400" },
  { id: "other", name: "その他", icon: "📦", color: "from-gray-400 to-gray-600" },
];

function calcSplit(total: number, people: number, round: string, extras: (number|null)[], individualShares: {[key: number]: number} = {}) {
  if (people <= 0) return { per: 0, details: [] };
  
  // 個別負担率がある場合の計算
  const hasIndividualShares = Object.keys(individualShares).length > 0;
  
  if (hasIndividualShares) {
    const totalShare = Object.values(individualShares).reduce((sum, share) => sum + share, 0);
    if (totalShare === 0) return { per: 0, details: Array(people).fill(0) };
    
    const details = Array(people).fill(0).map((_, i) => {
      const share = individualShares[i] || 0;
      return Math[round as "floor" | "ceil" | "round"]((total * share) / totalShare);
    });
    
    // 端数調整
    const calculatedTotal = details.reduce((sum, amount) => sum + amount, 0);
    if (calculatedTotal !== total) {
      const diff = total - calculatedTotal;
      details[0] += diff; // 最初の人に端数を追加
    }
    
    return { per: details[0], details };
  }
  
  // 従来の計算（均等割り勘）
  const fixed = extras.map((v, i) => ({ idx: i, value: v })).filter(x => x.value !== null && x.value > 0);
  const restPeople = people - fixed.length;
  const restTotal = total - fixed.reduce((a, b) => a + (b.value ?? 0), 0);
  let per = restPeople > 0 ? Math[round as "floor" | "ceil" | "round"](restTotal / restPeople) : 0;
  let details = Array(people).fill(0).map((_, i) => (extras[i] !== null && extras[i]! > 0 ? extras[i]! : per));
  return { per, details };
}

// 送金ルート計算（支払済み精算）
function calcSettlement(details: number[], paids: (number|null)[]) {
  // 各人の「実際支払額」-「本来負担額」でバランスを計算
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

export default function Home() {
  const { themeIdx, setThemeIdx } = useContext(ThemeContext);
  // 基本状態
  const [people, setPeople] = useState(3);
  const [total, setTotal] = useState(9000);
  const [round, setRound] = useState("round");
  const [memo, setMemo] = useState("");
  const [extras, setExtras] = useState(["", "", ""]);
  const [names, setNames] = useState(["1人目", "2人目", "3人目"]);
  const [paids, setPaids] = useState(["", "", ""]);
  const [category, setCategory] = useState("food");
  const [paymentMethods, setPaymentMethods] = useState<string[]>(["cash"]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("paypay");

  // 機能ON/OFF設定
  const [enableCurrency, setEnableCurrency] = useState(false);
  const [enableTip, setEnableTip] = useState(false);
  const [enableUnevenSplit, setEnableUnevenSplit] = useState(false);
  
  // 通貨・チップ・不均等割り勘設定
  const [currency, setCurrency] = useState("JPY");
  const [tipRate, setTipRate] = useState(0);
  const [individualShares, setIndividualShares] = useState<{[key: number]: number}>({});

  // イベント管理
  const [events, setEvents] = useState<{
    id: string;
    name: string;
    date: string;
    total: number;
    people: number;
    category: string;
  }[]>([]);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [newEventName, setNewEventName] = useState("");

  // グループ管理
  const [groups, setGroups] = useState<{
    id: string;
    name: string;
    members: string[];
    events: string[];
    owner: string;
  }[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newMemberName, setNewMemberName] = useState("");

  // アカウント管理
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name: string;
    email: string;
    groups: string[];
  } | null>(null);
  const [history, setHistory] = useState<{
    date:string,
    people:number,
    total:number,
    per:number,
    memo:string,
    names?:string[],
    paids?:(number|null)[],
    settlements?:{from:number,to:number,amount:number}[]
  }[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const router = useRouter();

  // 計算
  const paidsNum = paids.map(p => p === "" ? null : Number(p));
  const selectedCurrency = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0];
  const tipAmount = enableTip ? Math.round(total * tipRate) : 0;
  const totalWithTip = total + tipAmount;
  const { per, details } = calcSplit(
    totalWithTip, 
    people, 
    round, 
    Array(people).fill(null), 
    enableUnevenSplit ? individualShares : {}
  );
  const settlements = calcSettlement(details, paidsNum);

  // 履歴保存
  const saveHistory = () => {
    setHistory([{ 
      date: new Date().toLocaleString(), 
      people, 
      total, 
      per, 
      memo, 
      names: [...names], 
      paids: [...paidsNum], 
      settlements: [...settlements] 
    }, ...history].slice(0, 5));
  };

  // 人数変更時にextras配列・names配列・paids配列も調整
  const handlePeople = (n: number) => {
    setPeople(n);
    setExtras((prev) => {
      const arr = [...prev];
      while (arr.length < n) arr.push("");
      while (arr.length > n) arr.pop();
      return arr;
    });
    setNames((prev) => {
      const arr = [...prev];
      while (arr.length < n) arr.push(`${arr.length+1}人目`);
      while (arr.length > n) arr.pop();
      return arr;
    });
    setPaids((prev) => {
      const arr = [...prev];
      while (arr.length < n) arr.push("");
      while (arr.length > n) arr.pop();
      return arr;
    });
  };

  // シェア用テキスト
  const shareText = paidsNum.some((v)=>v!==null && v>0) 
    ? `【割り勘計算】\n${people}人で${total}${enableCurrency ? selectedCurrency.symbol : "円"}\n${enableTip && tipRate > 0 ? `チップ(${tipRate * 100}%): ${tipAmount}${enableCurrency ? selectedCurrency.symbol : "円"}\n` : ""}${memo ? "用途: " + memo + "\n" : ""}${paidsNum.map((paid,i)=>`${names[i]||`${i+1}人目`}: ${paid ?? 0}${enableCurrency ? selectedCurrency.symbol : "円"}支払済み`).join("\n")}\n${settlements.length > 0 ? `\n【送金ルート】\n${settlements.map(s=>`${names[s.from]||`${s.from+1}人目`} → ${names[s.to]||`${s.to+1}人目`}: ${s.amount}${enableCurrency ? selectedCurrency.symbol : "円"}`).join("\n")}` : "\n精算不要です"}`
    : `【割り勘計算】\n${people}人で${total}${enableCurrency ? selectedCurrency.symbol : "円"}\n${enableTip && tipRate > 0 ? `チップ(${tipRate * 100}%): ${tipAmount}${enableCurrency ? selectedCurrency.symbol : "円"}\n` : ""}1人あたり: ${per}${enableCurrency ? selectedCurrency.symbol : "円"}\n${details.map((d,i)=>`${names[i]||`${i+1}人目`}:${d}${enableCurrency ? selectedCurrency.symbol : "円"}`).join(" ")}\n${memo ? "用途: " + memo : ""}`;

  // シェア
  const share = () => {
    navigator.clipboard.writeText(shareText);
    alert("クリップボードにコピーしました！");
  };

  // LINE共有
  const shareLine = () => {
    const url = `https://line.me/R/msg/text/?${encodeURIComponent(shareText)}`;
    window.open(url, "_blank");
  };

  // CSV出力
  const exportCSV = () => {
    const csv = paidsNum.some((v)=>v!==null && v>0)
      ? [
          ["項目", "内容"],
          ["通貨", selectedCurrency.name],
          ["人数", people],
          ["合計金額", `${total}${selectedCurrency.symbol}`],
          ["チップ", tipRate > 0 ? `${tipRate * 100}% (${tipAmount}${selectedCurrency.symbol})` : "なし"],
          ["用途", memo],
          ["カテゴリ", CATEGORIES.find(c => c.id === category)?.name || "その他"],
          ["", ""],
          ["支払済み状況", ""],
          ...paidsNum.map((paid,i)=>[`${names[i]||`${i+1}人目`}`, `${paid ?? 0}${selectedCurrency.symbol}`]),
          ["", ""],
          ["送金ルート", ""],
          ...(settlements.length > 0 
            ? settlements.map(s=>[`${names[s.from]||`${s.from+1}人目`} → ${names[s.to]||`${s.to+1}人目`}`, `${s.amount}${selectedCurrency.symbol}`])
            : [["精算不要", "全員の支払いが一致しています"]]
          )
        ]
      : [
          ["項目", "内容"],
          ["通貨", selectedCurrency.name],
          ["人数", people],
          ["合計金額", `${total}${selectedCurrency.symbol}`],
          ["チップ", tipRate > 0 ? `${tipRate * 100}% (${tipAmount}${selectedCurrency.symbol})` : "なし"],
          ["1人あたり", `${per}${selectedCurrency.symbol}`],
          ["用途", memo],
          ["カテゴリ", CATEGORIES.find(c => c.id === category)?.name || "その他"],
          ["", ""],
          ["各人負担額", ""],
          ...details.map((d,i)=>[`${names[i]||`${i+1}人目`}`, `${d}${selectedCurrency.symbol}`])
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

  // 支払い方法別QRコード生成
  const generatePaymentQR = (method: string, amount: number, recipient: string) => {
    const paymentData = {
      method,
      amount,
      recipient,
      currency: selectedCurrency.code,
      memo: memo || "割り勘精算",
      timestamp: new Date().toISOString()
    };
    return JSON.stringify(paymentData);
  };

  // イベント管理
  const createEvent = () => {
    if (!newEventName.trim()) return;
    const eventId = Date.now().toString();
    const newEvent = {
      id: eventId,
      name: newEventName,
      date: new Date().toLocaleDateString(),
      total: 0,
      people: 0,
      category: "other"
    };
    setEvents([...events, newEvent]);
    setNewEventName("");
    setShowEventModal(false);
  };

  const deleteEvent = (eventId: string) => {
    setEvents(events.filter(e => e.id !== eventId));
    if (currentEventId === eventId) {
      setCurrentEventId(null);
    }
  };

  // グループ管理
  const createGroup = async () => {
    if (!newGroupName.trim() || !currentUser) return;
    const groupId = await createGroupFirestore({
      name: newGroupName,
      ownerId: currentUser.id,
      ownerName: currentUser.name,
    });
    setGroups([...groups, { id: groupId, name: newGroupName, members: [currentUser.name], events: [], owner: currentUser.id }]);
    setNewGroupName("");
    setShowGroupModal(false);
    router.push(`/group/${groupId}`);
  };

  const addMemberToGroup = (groupId: string) => {
    if (!newMemberName.trim()) return;
    setGroups(groups.map(g => 
      g.id === groupId 
        ? { ...g, members: [...g.members, newMemberName] }
        : g
    ));
    setNewMemberName("");
  };

  const removeMemberFromGroup = (groupId: string, memberName: string) => {
    setGroups(groups.map(g => 
      g.id === groupId 
        ? { ...g, members: g.members.filter(m => m !== memberName) }
        : g
    ));
  };

  const deleteGroup = (groupId: string) => {
    setGroups(groups.filter(g => g.id !== groupId));
    if (currentGroupId === groupId) {
      setCurrentGroupId(null);
    }
  };

  // Googleログイン専用の関数
  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      alert("Googleログインに失敗しました");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setIsLoggedIn(false);
    setGroups([]);
    setEvents([]);
  };

  // 履歴削除
  const deleteHistory = (idx:number) => setHistory(history.filter((_,i)=>i!==idx));
  const clearHistory = () => setHistory([]);

  // Googleログイン状態管理
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser({
          id: user.uid,
          name: user.displayName || user.email?.split("@")[0] || "User",
          email: user.email || "",
          groups: [],
        });
        setIsLoggedIn(true);
      } else {
        setCurrentUser(null);
        setIsLoggedIn(false);
      }
    });
    return () => unsub();
  }, []);

  // Firestoreグループ作成
  const handleJoinGroup = async (groupId: string) => {
    if (!currentUser) return;
    await joinGroup(groupId, { id: currentUser.id, name: currentUser.name });
    const group = await getGroup(groupId) as any;
    if (group) {
      setGroups([...groups, { id: groupId, name: group.name, members: group.members.map((m:any)=>m.name), events: [], owner: group.owner }]);
      alert("グループに参加しました！");
    } else {
      alert("グループが見つかりません");
    }
  };

  // グループ一覧取得
  const [myGroups, setMyGroups] = useState<any[]>([]);
  // 自分が参加したグループ一覧を取得
  useEffect(() => {
    if (!currentUser) return;
    const fetchGroups = async () => {
      const db = getFirestore();
      const q = query(collection(db, "groups"), where("members", "array-contains", { id: currentUser.id, name: currentUser.name }));
      const snap = await getDocs(q);
      setMyGroups(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchGroups();
  }, [currentUser]);

  // グループ削除
  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm("本当にこのグループを削除しますか？")) return;
    await deleteGroupWithEvents(groupId);
    setMyGroups(myGroups.filter(g => g.id !== groupId));
  };

  // イベント削除
  const handleDeleteEvent = async (groupId: string, eventId: string) => {
    if (!window.confirm("本当にこのイベントを削除しますか？")) return;
    await deleteEventDoc(groupId, eventId);
    setMyGroups(myGroups.map(g => g.id === groupId ? { ...g, events: g.events.filter((e:any) => e.id !== eventId) } : g));
  };

  return (
    <div className={`relative min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-gradient-to-br ${THEMES[themeIdx].bg} overflow-hidden`}>
      <AnimatedParticles themeIdx={themeIdx} />
      {/* テーマ切替ボタン */}
      <div className="fixed top-6 right-6 z-20 flex gap-2">
        {THEMES.map((t, i) => (
          <button
            key={t.name}
            className={`rounded-full px-4 py-2 text-sm font-bold shadow-md border-2 border-white/40 transition-all ${themeIdx===i?"bg-white/80 text-gray-900 scale-110":"bg-white/40 text-gray-700 hover:scale-105"}`}
            onClick={()=>setThemeIdx(i)}
          >{t.name}</button>
        ))}
      </div>
      <motion.section
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="flex flex-col items-center gap-10 z-10 w-full max-w-lg"
      >
        {/* ヒーロー */}
        <GlassCard className="flex flex-col items-center gap-4 w-full rounded-[3rem]">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight text-center drop-shadow-lg mb-2">
            割り勘計算<br /><span className="text-lg font-normal">Dutch treat</span>
          </h1>
          <p className="text-lg text-gray-700 dark:text-gray-200 text-center mb-2">簡単に割り勘計算できる！</p>
          
          {/* アカウント管理 */}
          <div className="flex gap-2 mt-2">
            {!isLoggedIn ? (
              <button
                onClick={handleGoogleLogin}
                className="px-6 py-2 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 text-white font-bold shadow hover:scale-105 transition-all text-lg flex items-center gap-2"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M21.805 10.023h-9.765v3.977h5.617c-.242 1.242-1.484 3.648-5.617 3.648-3.375 0-6.125-2.789-6.125-6.211 0-3.422 2.75-6.211 6.125-6.211 1.922 0 3.211.82 3.953 1.523l2.703-2.633c-1.711-1.594-3.922-2.57-6.656-2.57-5.523 0-10 4.477-10 10s4.477 10 10 10c5.781 0 9.609-4.055 9.609-9.773 0-.656-.07-1.156-.156-1.65z" fill="#4285F4"></path><path d="M3.152 7.548l3.281 2.406c.891-1.711 2.672-2.953 4.805-2.953 1.094 0 2.125.375 2.922 1.016l2.797-2.719c-1.711-1.594-3.922-2.57-6.656-2.57-3.797 0-7.016 2.461-8.406 5.953z" fill="#34A853"></path><path d="M12 22c2.672 0 4.922-.883 6.563-2.398l-3.047-2.492c-.844.57-1.922.914-3.516.914-2.844 0-5.242-1.922-6.102-4.523l-3.242 2.5c1.375 3.461 4.594 5.999 8.344 5.999z" fill="#FBBC05"></path><path d="M21.805 10.023h-9.765v3.977h5.617c-.242 1.242-1.484 3.648-5.617 3.648-3.375 0-6.125-2.789-6.125-6.211 0-3.422 2.75-6.211 6.125-6.211 1.922 0 3.211.82 3.953 1.523l2.703-2.633c-1.711-1.594-3.922-2.57-6.656-2.57-5.523 0-10 4.477-10 10s4.477 10 10 10c5.781 0 9.609-4.055 9.609-9.773 0-.656-.07-1.156-.156-1.65z" fill="none"></path></g></svg>
                Googleでログイン
              </button>
            ) : (
              <>
                <span className="px-4 py-2 rounded-full bg-white/50 text-gray-700 font-bold text-sm">
                  👤 {currentUser?.name}
                </span>
                <button
                  onClick={() => setShowGroupModal(true)}
                  className="px-4 py-2 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 text-white font-bold shadow hover:scale-105 transition-all text-sm"
                >
                  📋 グループ管理
                </button>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-full bg-gradient-to-r from-red-400 to-pink-400 text-white font-bold shadow hover:scale-105 transition-all text-sm"
                >
                  🚪 ログアウト
                </button>
              </>
            )}
          </div>
        </GlassCard>
        {/* 参加中のグループ一覧をここに移動 */}
        {isLoggedIn && myGroups.length > 0 && (
          <GlassCard className="w-full max-w-2xl mt-8">
            <h2 className="text-xl font-bold mb-4">参加中のグループ一覧</h2>
            <ul className="space-y-4">
              {myGroups.map(group => (
                <li key={group.id} className="bg-white/40 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <Link href={`/group/${group.id}`} className="font-bold text-lg hover:underline">{group.name}</Link>
                    <div className="flex gap-2">
                      <button className="px-3 py-1 rounded-full bg-red-400 text-white text-xs font-bold" onClick={()=>handleDeleteGroup(group.id)}>削除</button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-700">メンバー: {group.members?.map((m:any)=>m.name||m).join(", ")}</div>
                  <div className="text-xs text-gray-500">ID: {group.id}</div>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
        {/* 割り勘フォーム */}
        <GlassCard className="w-full flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <label className="font-bold">人数</label>
            <input type="number" min={1} max={20} value={people} onChange={e=>handlePeople(Number(e.target.value))} className="rounded-xl px-4 py-2 border border-white/40 bg-white/60 focus:outline-none text-lg" />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <label className="font-bold">通貨設定</label>
              <button
                onClick={() => setEnableCurrency(!enableCurrency)}
                className={`w-12 h-6 rounded-full transition-all ${enableCurrency ? 'bg-blue-500' : 'bg-gray-300'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-all ${enableCurrency ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {enableCurrency && (
              <div className="flex gap-2 flex-wrap">
                {CURRENCIES.map(c => (
                  <button
                    key={c.code}
                    className={`rounded-full px-4 py-2 text-sm font-bold border-2 border-white/40 transition-all ${currency===c.code?"bg-white/80 text-gray-900 scale-110":"bg-white/40 text-gray-700 hover:scale-105"}`}
                    onClick={() => setCurrency(c.code)}
                  >
                    {c.symbol} {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <label className="font-bold">合計金額 ({enableCurrency ? selectedCurrency.symbol : "円"})</label>
            <input type="number" min={0} value={total} onChange={e=>setTotal(Number(e.target.value))} className="rounded-xl px-4 py-2 border border-white/40 bg-white/60 focus:outline-none text-lg" />
          </div>
          <div className="flex flex-col gap-3">
            <label className="font-bold">端数処理</label>
            <div className="flex gap-2">
              {ROUND_OPTIONS.map(opt => (
                <button key={opt.value} className={`rounded-full px-4 py-2 text-sm font-bold border-2 border-white/40 transition-all ${round===opt.value?"bg-white/80 text-gray-900 scale-110":"bg-white/40 text-gray-700 hover:scale-105"}`} onClick={()=>setRound(opt.value)}>{opt.label}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <label className="font-bold">カテゴリ</label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map(c => (
                <button
                  key={c.id}
                  className={`rounded-full px-4 py-2 text-sm font-bold border-2 border-white/40 transition-all ${category===c.id?"bg-white/80 text-gray-900 scale-110":"bg-white/40 text-gray-700 hover:scale-105"}`}
                  onClick={() => setCategory(c.id)}
                >
                  <span className="mr-1">{c.icon}</span>
                  {c.name}
                </button>
              ))}
            </div>
        </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <label className="font-bold">チップ設定</label>
              <button
                onClick={() => setEnableTip(!enableTip)}
                className={`w-12 h-6 rounded-full transition-all ${enableTip ? 'bg-blue-500' : 'bg-gray-300'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-all ${enableTip ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {enableTip && (
              <>
                <div className="flex gap-2 flex-wrap">
                  {TIP_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      className={`rounded-full px-4 py-2 text-sm font-bold border-2 border-white/40 transition-all ${tipRate===opt.value?"bg-white/80 text-gray-900 scale-110":"bg-white/40 text-gray-700 hover:scale-105"}`}
                      onClick={() => setTipRate(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {tipRate > 0 && (
                  <div className="text-sm text-gray-600 bg-white/50 rounded-lg p-2">
                    チップ金額: {tipAmount}{enableCurrency ? selectedCurrency.symbol : "円"} (合計: {totalWithTip}{enableCurrency ? selectedCurrency.symbol : "円"})
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <label className="font-bold">不均等割り勘設定</label>
              <button
                onClick={() => setEnableUnevenSplit(!enableUnevenSplit)}
                className={`w-12 h-6 rounded-full transition-all ${enableUnevenSplit ? 'bg-blue-500' : 'bg-gray-300'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-all ${enableUnevenSplit ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {enableUnevenSplit && (
              <div className="bg-white/50 rounded-lg p-3">
                <div className="text-sm text-gray-600 mb-2">各人の負担率を設定（合計100%になるように）</div>
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({length: people}).map((_,i)=>(
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-sm font-semibold w-16">{names[i] || `${i+1}人目`}:</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={individualShares[i] || 0}
                        onChange={e => {
                          const value = Number(e.target.value);
                          setIndividualShares(prev => ({
                            ...prev,
                            [i]: value
                          }));
                        }}
                        className="w-16 rounded-lg px-2 py-1 border border-white/40 bg-white/80 focus:outline-none text-sm"
                        placeholder="%"
                      />
                      <span className="text-xs text-gray-500">%</span>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  合計: {Object.values(individualShares).reduce((sum, share) => sum + (share || 0), 0)}%
                  {Object.values(individualShares).reduce((sum, share) => sum + (share || 0), 0) !== 100 && 
                    <span className="text-red-500 ml-2">※100%になるように調整してください</span>
                  }
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <label className="font-bold">用途メモ</label>
            <input type="text" value={memo} onChange={e=>setMemo(e.target.value)} className="rounded-xl px-4 py-2 border border-white/40 bg-white/60 focus:outline-none text-lg" placeholder="例: 飲み会" />
          </div>
          <div className="flex flex-col gap-4">
            {Array.from({length: people}).map((_,i)=>(
              <div key={i} className="flex flex-col sm:flex-row items-center gap-3 bg-white/60 dark:bg-white/10 rounded-2xl p-4 shadow-md w-full">
                <input
                  type="text"
                  value={names[i] || ""}
                  onChange={e => {
                    const arr = [...names]; arr[i] = e.target.value; setNames(arr);
                  }}
                  className="rounded-xl px-4 py-3 border border-white/40 bg-white/80 focus:outline-none text-base w-full min-w-0 font-semibold"
                  placeholder={`${i+1}人目`}
                />
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="number"
                    min={0}
                    value={paids[i]}
                    onChange={e=>{
                      const arr = [...paids]; arr[i]=e.target.value; setPaids(arr);
                    }}
                    className="rounded-xl px-4 py-3 border border-white/40 bg-white/80 focus:outline-none text-base w-32 min-w-0 font-semibold"
                    placeholder="支払済み"
                  />
                  <span className="text-sm text-gray-500">{enableCurrency ? selectedCurrency.symbol : "円"}支払</span>
                  <button
                    type="button"
                    className="ml-1 px-4 py-2 rounded-full bg-gradient-to-r from-pink-300 via-blue-300 to-purple-300 text-white text-sm font-bold shadow hover:scale-105 transition-all"
                    onClick={() => {
                      const others = paids.map((v, idx) => idx !== i ? Number(v) || 0 : 0).reduce((a, b) => a + b, 0);
                      const remain = Math.max(totalWithTip - others, 0);
                      const arr = [...paids]; arr[i] = remain ? String(remain) : ""; setPaids(arr);
                    }}
                  >残り全額</button>
                </div>
              </div>
            ))}
          </div>
          <button className="mt-4 px-8 py-3 rounded-full bg-gradient-to-r from-pink-400 via-blue-400 to-purple-400 text-white font-bold shadow-lg hover:scale-105 transition-transform text-lg" onClick={()=>{setShowResult(true);saveHistory();}}>
            割り勘計算する
          </button>
        </GlassCard>
        {/* 結果カード */}
        <AnimatePresence>
          {showResult && (
            <motion.div
              className="w-full"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ duration: 0.7 }}
            >
              <GlassCard className="w-full text-center">
                <h2 className="text-2xl font-bold mb-4">計算結果</h2>
                {paidsNum.some((v)=>v!==null && v>0) ? (
                  <>
                    {settlements.length > 0 ? (
                      <div className="mb-2 text-base text-gray-700">下記の通り送金してください</div>
                    ) : (
                      <div className="mb-2 text-base text-gray-700">精算不要です（全員の支払いが一致しています）</div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-lg mb-2">1人あたり <span className="font-extrabold text-2xl">{per}</span> {enableCurrency ? selectedCurrency.symbol : "円"}</div>
                    <div className="mb-2">{details.map((d,i)=>(<span key={i} className="inline-block mx-1 px-2 py-1 rounded-full bg-white/50 text-gray-700 text-sm">{names[i]||`${i+1}人目`}: {d}{enableCurrency ? selectedCurrency.symbol : "円"}</span>))}</div>
                  </>
                )}
                <div className="mb-2 text-gray-500 text-sm">{memo && `用途: ${memo}`}</div>
                <div className="flex gap-2 justify-center mt-4 flex-wrap">
                  <button className="px-6 py-2 rounded-full bg-white/70 text-gray-900 font-bold shadow hover:scale-105 transition-all" onClick={share}>シェア</button>
                  <button className="px-6 py-2 rounded-full bg-white/70 text-gray-900 font-bold shadow hover:scale-105 transition-all" onClick={shareLine}>LINE共有</button>
                  <button className="px-6 py-2 rounded-full bg-white/70 text-gray-900 font-bold shadow hover:scale-105 transition-all" onClick={exportCSV}>CSV出力</button>
                  <button className="px-6 py-2 rounded-full bg-white/70 text-gray-900 font-bold shadow hover:scale-105 transition-all" onClick={()=>setShowQR(true)}>共有QR</button>
                  <button className="px-6 py-2 rounded-full bg-white/70 text-gray-900 font-bold shadow hover:scale-105 transition-all" onClick={()=>setShowResult(false)}>閉じる</button>
                </div>
                {showQR && (
                  <motion.div
                    className="mt-4"
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 40 }}
                    transition={{ duration: 0.7 }}
                  >
                    <GlassCard className="w-full text-center">
                      <QRCodeCanvas value={shareText} size={180} />
                      <button className="px-6 py-2 rounded-full bg-white/70 text-gray-900 font-bold shadow hover:scale-105 transition-all" onClick={()=>setShowQR(false)}>閉じる</button>
                    </GlassCard>
                  </motion.div>
                )}
                {settlements.length > 0 && (
                  <div className="mt-4 text-left">
                    <h3 className="font-bold mb-2">送金ルート</h3>
                    <ul className="text-sm">
                      {settlements.map((s,i)=>(
                        <li key={i}>{(names[s.from]||`${s.from+1}人目`)} → {(names[s.to]||`${s.to+1}人目`)} : {s.amount}{enableCurrency ? selectedCurrency.symbol : "円"}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* イベント管理モーダル */}
        <AnimatePresence>
          {showEventModal && (
            <motion.div
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <GlassCard className="w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4 text-center">イベント管理</h2>
                <div className="mb-4">
                  <input
                    type="text"
                    value={newEventName}
                    onChange={e => setNewEventName(e.target.value)}
                    placeholder="イベント名を入力"
                    className="w-full rounded-xl px-4 py-2 border border-white/40 bg-white/60 focus:outline-none"
                  />
                  <button
                    onClick={createEvent}
                    className="w-full mt-2 px-4 py-2 rounded-full bg-gradient-to-r from-green-400 to-blue-400 text-white font-bold shadow hover:scale-105 transition-all"
                  >
                    イベント作成
                  </button>
                </div>
                {events.length > 0 && (
                  <div className="mb-4">
                    <h3 className="font-bold mb-2">作成済みイベント</h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {events.map(event => (
                        <div key={event.id} className="flex justify-between items-center bg-white/30 rounded-lg p-2">
                          <span className="text-sm">{event.name}</span>
                          <button
                            onClick={() => deleteEvent(event.id)}
                            className="text-red-500 text-sm px-2 py-1 rounded hover:bg-red-100"
                          >
                            削除
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setShowEventModal(false)}
                  className="w-full px-4 py-2 rounded-full bg-white/70 text-gray-900 font-bold shadow hover:scale-105 transition-all"
                >
                  閉じる
                </button>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* グループ管理モーダル */}
        <AnimatePresence>
          {showGroupModal && (
            <motion.div
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <GlassCard className="w-full max-w-md">
                <h2 className="text-2xl font-bold mb-4 text-center">グループ管理</h2>
                <div className="mb-4">
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="グループ名を入力"
                    className="w-full rounded-xl px-4 py-2 border border-white/40 bg-white/60 focus:outline-none"
                  />
                  <button
                    onClick={createGroup}
                    className="w-full mt-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 text-white font-bold shadow hover:scale-105 transition-all"
                  >
                    グループ作成
                  </button>
                </div>
                {groups.length > 0 && (
                  <div className="mb-4">
                    <h3 className="font-bold mb-2">作成済みグループ</h3>
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {groups.map(group => (
                        <div key={group.id} className="bg-white/30 rounded-lg p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-bold">{group.name}</span>
                            <button
                              onClick={() => deleteGroup(group.id)}
                              className="text-red-500 text-sm px-2 py-1 rounded hover:bg-red-100"
                            >
                              削除
                            </button>
                          </div>
                          <div className="mb-2">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={newMemberName}
                                onChange={e => setNewMemberName(e.target.value)}
                                placeholder="メンバー名"
                                className="flex-1 rounded-lg px-2 py-1 border border-white/40 bg-white/60 focus:outline-none text-sm"
                              />
                              <button
                                onClick={() => addMemberToGroup(group.id)}
                                className="px-3 py-1 rounded-full bg-green-400 text-white text-sm font-bold hover:scale-105 transition-all"
                              >
                                追加
                              </button>
                            </div>
                          </div>
                          {group.members.length > 0 && (
                            <div className="text-sm">
                              <span className="font-semibold">メンバー:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {group.members.map((member, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 bg-white/50 rounded-full px-2 py-1 text-xs"
                                  >
                                    {member}
                                    <button
                                      onClick={() => removeMemberFromGroup(group.id, member)}
                                      className="text-red-500 hover:text-red-700"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setShowGroupModal(false)}
                  className="w-full px-4 py-2 rounded-full bg-white/70 text-gray-900 font-bold shadow hover:scale-105 transition-all"
                >
                  閉じる
                </button>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </div>
  );
}
