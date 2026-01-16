const CANDIDATES = [
    ()=>`${location.protocol}//${location.hostname}:2025`,
    ()=>localStorage.getItem("API_OVERRIDE")||"",
    () => `${process.env.REACT_APP_SERVER_URI || ''}`
];

export const probe = async(url, ms=800) => {
    if(!url) throw new Error("skip");
    const ctl = new AbortController();
    const t = setTimeout(()=>ctl.abort(), ms);
    try{
        const res = await fetch(url+"/api/health", {signal: ctl.signal, credentials: "include"});
        if(!res.ok) throw new Error("bad");
        localStorage.setItem("API_Last_GOOD", url);
        return url;
    } finally{
        clearTimeout(t);
    }
}

export const getApiBaseUrl = async() => {
    console.log("Probing for API server...");
    const last = localStorage.getItem("API_Last_GOOD");
    console.log("Last known good API server:", last);
    if(last){
        try{
            const s = await probe(last, 400);
            console.log("server url", s);
            return s;
        } catch(err){}
    }
    const attempts = CANDIDATES.map(f => probe(f()).catch(()=>Promise.reject()));
    console.log("Probing candidates:", CANDIDATES.map(f=>f()));
    try{
        const first = await Promise.any(attempts);
        console.log("first server url", first);
        return first;
    } catch{
        console.error("No API server found on LAN");
        return "http://localhost:2025";
        //throw new Error("No API server found on LAN");
    }
}