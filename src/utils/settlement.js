/**
 * Settlement Engine
 * Input: members [{name, balance}]
 * Output: { settlements: [{from,to,amount}], algorithm: 'optimal'|'greedy' }
 */

function settleOptimal(members) {
  const debt = [], cred = [];
  for (const m of members) {
    if (m.balance < -1e-6) debt.push({ name: m.name, amt: -m.balance });
    else if (m.balance > 1e-6) cred.push({ name: m.name, amt: m.balance });
  }

  let best = null;

  function dfs(dIdx, curr, dArr, cArr) {
    while (dIdx < dArr.length && dArr[dIdx].amt === 0) dIdx++;
    if (dIdx === dArr.length) {
      if (best === null || curr.length < best.length) {
        best = curr.map(x => ({ ...x }));
      }
      return;
    }
    if (best !== null && curr.length >= best.length) return;

    for (let j = 0; j < cArr.length; j++) {
      if (cArr[j].amt === 0) continue;
      const pay = Math.min(dArr[dIdx].amt, cArr[j].amt);

      dArr[dIdx].amt -= pay;
      cArr[j].amt -= pay;
      curr.push({ from: dArr[dIdx].name, to: cArr[j].name, amount: +pay.toFixed(2) });

      dfs(dIdx + (dArr[dIdx].amt === 0 ? 1 : 0), curr, dArr, cArr);

      curr.pop();
      dArr[dIdx].amt += pay;
      cArr[j].amt += pay;
    }
  }

  dfs(0, [], debt.map(x => ({ ...x })), cred.map(x => ({ ...x })));

  return { settlements: best || [], algorithm: 'optimal' };
}

function settleGreedy(members) {
  const debt = [], cred = [];
  for (const m of members) {
    if (m.balance < -1e-6) debt.push({ name: m.name, amt: -m.balance });
    else if (m.balance > 1e-6) cred.push({ name: m.name, amt: m.balance });
  }

  debt.sort((a, b) => b.amt - a.amt);
  cred.sort((a, b) => b.amt - a.amt);

  const settlements = [];

  while (debt.length && cred.length) {
    const d = debt[0];
    const c = cred[0];
    const pay = Math.min(d.amt, c.amt);

    settlements.push({ from: d.name, to: c.name, amount: +pay.toFixed(2) });

    d.amt -= pay;
    c.amt -= pay;

    if (d.amt <= 1e-6) debt.shift();
    if (c.amt <= 1e-6) cred.shift();

    debt.sort((a, b) => b.amt - a.amt);
    cred.sort((a, b) => b.amt - a.amt);
  }

  return { settlements, algorithm: 'greedy' };
}

function computeSettlement(members) {
  if (!members || members.length === 0) return { settlements: [], algorithm: 'none' };
  if (members.length <= 15) return settleOptimal(members);
  return settleGreedy(members);
}

module.exports = { computeSettlement };
