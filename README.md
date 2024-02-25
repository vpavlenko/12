<img src="https://github.com/vpavlenko/12/assets/1491908/b02f2946-16be-4b79-a081-0e4cdd9b0122" width="300" align="right" />


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
