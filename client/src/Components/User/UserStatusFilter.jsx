// ==========================
// 📄 UserStatusFilter.jsx
// ==========================
import React, { useEffect, useId, useRef } from "react";
import styles from "./UserStatusFilter.module.css";


/**
* UserStatusFilter – Segmented control (3 מצבים) בעברית עם RTL
*
* Props:
* - value?: "active" | "pending" | "inactive" // נשלט
* - defaultValue?: "active" | "pending" | "inactive" // לא נשלט (ברירת מחדל: "active")
* - onChange?: (next) => void
* - counts?: { active?: number; pending?: number; inactive?: number }
* - disabled?: boolean
* - compact?: boolean // מרווחים קטנים יותר
* - className?: string
*/
export default function UserStatusFilter({
    value, defaultValue = "active", onChange,
    counts, disabled = false, compact = false, className = "",
    }){
    const isControlled = value !== undefined;
    const [internal, setInternal] = React.useState(defaultValue);
    const current = isControlled ? value : internal;


    // שומר על פתיחה תמידית במצב "active" אלא אם נשלח defaultValue אחר
    useEffect(()=>{ if(!isControlled) setInternal(defaultValue); }, [defaultValue, isControlled]);


    const id = useId();
    const rootRef = useRef(null);


    const buttons = [
        { key: "active", label: "פעילים", badge: counts?.active, color: '#8feba6ff' },
        { key: "waiting", label: "ממתינים", badge: counts?.pending, color: '#e9f85eff' },
        { key: "noActive",label: "לא פעילים", badge: counts?.inactive, color: '#eea3a3ff' },
    ];

    const select = (next) =>{
        if(disabled) return;
        if(!isControlled) setInternal(next);
        onChange?.(next);
    }


    // תמיכה במקלדת: חיצים ימין/שמאל + Home/End
    useEffect(()=>{
        const el = rootRef.current; if(!el) return;
        const handler = (e)=>{
            if(disabled) return;
            if(e.key === "ArrowLeft" || e.key === "ArrowRight"){
                e.preventDefault();
                const idx = buttons.findIndex(b=>b.key===current); if(idx===-1) return;
                const dir = e.key === "ArrowLeft" ? -1 : 1;
                const next = buttons[(idx + dir + buttons.length) % buttons.length].key;
                select(next);
            } else if(e.key === "Home"){
                e.preventDefault(); select(buttons[0].key);
            } else if(e.key === "End"){
                e.preventDefault(); select(buttons[buttons.length-1].key);
            }
        };
        el.addEventListener("keydown", handler); return ()=> el.removeEventListener("keydown", handler);
    }, [current, disabled]);


    return (
        <div className={`${styles.wrapper} ${compact ? styles.compact : ""} ${disabled ? styles.disabled : ""} ${className}`}>
        <div ref={rootRef}
            role="tablist"
            aria-label="סינון משתמשים לפי סטטוס"
            className={styles.group}
        >
            {buttons.map(({key, label, badge, color})=>{
                const selected = current === key;
                return (
                    <button key={key} role="tab"
                            aria-selected={selected}
                            aria-controls={`${id}-${key}`}
                            onClick={()=>select(key)}
                            className={`${styles.btn} ${selected ? styles.btnSelected : ""}`}
                            style={selected ? {backgroundColor: color} : {}}
                            type="button"disabled={disabled}
                    >
                        <span className={styles.label}>{label}</span>
                        {typeof badge === 'number' && <span className={styles.badge}>{badge}</span>}
                    </button>
                );
            })}
        </div>

        {/* אזור תוכן סמוי לטובת a11y (לא חובה) */}
        <div className={styles.srOnly} id={`${id}-active`} role="tabpanel" aria-labelledby="active" />
        <div className={styles.srOnly} id={`${id}-waiting`} role="tabpanel" aria-labelledby="waiting" />
        <div className={styles.srOnly} id={`${id}-noActive`} role="tabpanel" aria-labelledby="noActive" />
    </div>
    );
}