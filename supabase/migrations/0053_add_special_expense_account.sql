-- 「特別支出」口座（毎月繰り返さない・覚悟を持って買うような単発の高額出費専用。パソコン購入など）。
-- 予算は敢えて0のままにする（第2口座＝ローン等と同じ扱い）。budget=0の口座はaccountJudge()で
-- 「予算未設定」となり、使いすぎ/余裕ありの判定対象から外れる（このような単発出費は月次予算の
-- 消化率で良し悪しを判定する性質のものではないため）。
insert into accounts (id, name, color, budget, sort)
values ('a5', '第5口座（特別支出）', '#FF8A7A', 0, 5)
on conflict (id) do nothing;
