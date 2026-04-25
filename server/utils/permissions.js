const LEVEL = { view: 1, edit: 2, manage: 3 };

function canByRole({ role, required, visibility, acl = [] }) {
    if (role === "ادارة") return true;

    if (!LEVEL[required]) return false;

    if (visibility === "org") {
        return required === "view";
    }

    const need = LEVEL[required];

    return acl.some((rule) => {
        const ruleLevel = LEVEL[rule.permission] || 0;
        return ruleLevel >= need && (rule.roles || []).includes(role);
    });
}

module.exports = {
    canByRole,
};