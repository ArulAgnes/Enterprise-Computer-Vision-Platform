const {Pool} = require('pg');
const p = new Pool({connectionString: process.env.DATABASE_URL});
(async () => {
  const r = await p.query(`SELECT 
    (SELECT count(*)::int FROM images WHERE dataset_id='4b270c7e-9ffe-4085-b10b-7dbaba309521') as images,
    (SELECT count(*)::int FROM images WHERE dataset_id='4b270c7e-9ffe-4085-b10b-7dbaba309521' AND annotation_status='annotated') as annotated,
    (SELECT count(*)::int FROM annotations WHERE dataset_id='4b270c7e-9ffe-4085-b10b-7dbaba309521') as annotations,
    (SELECT count(*)::int FROM quality_reports WHERE dataset_id='4b270c7e-9ffe-4085-b10b-7dbaba309521') as quality_reports,
    (SELECT count(*)::int FROM dataset_splits WHERE dataset_id='4b270c7e-9ffe-4085-b10b-7dbaba309521') as splits,
    (SELECT count(*)::int FROM dataset_versions WHERE dataset_id='4b270c7e-9ffe-4085-b10b-7dbaba309521') as versions,
    (SELECT count(*)::int FROM classes WHERE dataset_id='4b270c7e-9ffe-4085-b10b-7dbaba309521') as classes`);
  console.log(JSON.stringify(r.rows[0], null, 2));
  
  // Check annotation coordinates
  const anns = await p.query(`SELECT id, x, y, width, height, class_name FROM annotations WHERE dataset_id='4b270c7e-9ffe-4085-b10b-7dbaba309521' LIMIT 5`);
  console.log('\nSample annotations:', JSON.stringify(anns.rows, null, 2));
  
  await p.end();
})().catch(e => { console.error(e); process.exit(1); });
