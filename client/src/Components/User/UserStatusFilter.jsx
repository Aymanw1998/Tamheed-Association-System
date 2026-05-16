// ==========================
// 📄 UserStatusFilter.jsx
// ==========================
import React, { useEffect, useId, useRef } from "react";
import styles from "./UserStatusFilter.module.css";


/**
* ملاحظة عربية
*
* Props:
* ملاحظة عربية
* ملاحظة عربية
* - onChange?: (next) => void
* - counts?: { active?: number; pending?: number; inactive?: number }
* - disabled?: boolean
* ملاحظة عربية
* - className?: string
*/
export default function UserStatusFilter({
    value, defaultValue = "active", onChange,
    counts, disabled = false, compact = false, className = "",
    }){
    const isControlled = value !== undefined;
    const [internal, setInternal] = React.useState(defaultValue);
    const current = isControlled ? value : internal;


    // ملاحظة عربية
    useEffect(()=>{ if(!isControlled) setInternal(defaultValue); }, [defaultValue, isControlled]);


    const id = useId();
    const rootRef = useRef(null);


    const buttons = [
        { key: "active", label: "مُفعالين", badge: counts?.active, color: '#8feba6ff' },
        { key: "waiting", label: "مُنتظرين", badge: counts?.pending, color: '#e9f85eff' },
        { key: "noActive",label: "مُعطل", badge: counts?.inactive, color: '#eea3a3ff' },
    ];

    const select = (next) =>{
        if(disabled) return;
        if(!isControlled) setInternal(next);
        onChange?.(next);
    }


    // ملاحظة عربية
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
            aria-label="تصفية المستخدمين حسب الحالة"
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

        {/* ملاحظة عربية */}
        <div className={styles.srOnly} id={`${id}-active`} role="tabpanel" aria-labelledby="active" />
        <div className={styles.srOnly} id={`${id}-waiting`} role="tabpanel" aria-labelledby="waiting" />
        <div className={styles.srOnly} id={`${id}-noActive`} role="tabpanel" aria-labelledby="noActive" />
    </div>
    );
}