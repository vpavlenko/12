# 12

```sql
SELECT *
FROM solo_info
JOIN composition_info ON solo_info.compid = composition_info.compid
WHERE composition_info.tonalitytype = 'BLUES'
AND composition_info.form = 'A12' AND solo_info.signature = '4/4'
AND solo_info.key LIKE '%maj';
```

on [wjazzd.db](https://jazzomat.hfm-weimar.de/dbformat/dboverview.html)
