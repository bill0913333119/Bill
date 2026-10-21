-- 預設工種、常見項目與分包商（已存在則略過）
insert into trades (id, label, icon, sort) values
  ('waterproof', '防水', '💧', 1),
  ('masonry',    '泥作', '🧱', 2),
  ('mep',        '水電', '⚡', 3),
  ('rebar',      '鋼筋', '🏗️', 4),
  ('formwork',   '模板', '🪵', 5),
  ('safety',     '工安', '⛑️', 6)
on conflict (id) do nothing;

insert into trade_items (trade_id, label, sort)
select t, l, o from (values
  ('waterproof', '滲漏水', 1), ('waterproof', '防水層破損', 2), ('waterproof', '收邊不良', 3), ('waterproof', '洩水坡度不足', 4), ('waterproof', '排水孔阻塞', 5),
  ('masonry', '牆面不平整', 1), ('masonry', '粉刷裂縫', 2), ('masonry', '磁磚空心', 3), ('masonry', '磁磚破損', 4), ('masonry', '牆面蜂窩', 5),
  ('mep', '管線未封', 1), ('mep', '留管位置錯誤', 2), ('mep', '線路外露', 3), ('mep', '開關盒歪斜', 4), ('mep', '套管未預埋', 5),
  ('rebar', '鋼筋外露', 1), ('rebar', '保護層不足', 2), ('rebar', '搭接長度不足', 3), ('rebar', '綁紮不確實', 4), ('rebar', '箍筋間距過大', 5),
  ('formwork', '模板變形', 1), ('formwork', '支撐不足', 2), ('formwork', '接縫漏漿', 3), ('formwork', '垂直度偏差', 4), ('formwork', '清潔口未清', 5),
  ('safety', '開口未防護', 1), ('safety', '護欄缺損', 2), ('safety', '未戴安全帽', 3), ('safety', '材料堆置不當', 4), ('safety', '施工架未固定', 5)
) as v(t, l, o)
on conflict (trade_id, label) do nothing;

insert into contractors (id, name, trade_id) values
  ('c1', '永固防水工程行', 'waterproof'),
  ('c2', '大成泥作工班',   'masonry'),
  ('c3', '光明水電工程',   'mep'),
  ('c4', '鋼強鋼筋工程',   'rebar'),
  ('c5', '協力模板工程',   'formwork'),
  ('c6', '工地安衛小組',   'safety')
on conflict (id) do nothing;
