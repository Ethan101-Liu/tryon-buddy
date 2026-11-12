import base64
import sys
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import serve_demo as app


def timeout():
    return app.PolicyError('moderation_unavailable', 'timeout')


class ReviewRecoveryTests(unittest.TestCase):
    def test_candidate_timeout_continues_same_row(self):
        image = 'data:image/jpeg;base64,' + base64.b64encode(b'candidate').decode()
        row = {'title': '男士白色连帽卫衣', 'url': 'https://shop.example/product/1', 'image': 'candidate'}
        query = {'query':'给我换个卫衣', 'kind':'top','context':'给我换个卫衣'}
        with patch.object(app,'DDGS') as search, patch.object(app,'public_url'), \
             patch.object(app,'garment_image',return_value=image) as download, \
             patch.object(app,'review_with_retry',side_effect=[timeout(),None]) as review, \
             patch.object(app.cloud,'garment',return_value={'kind':'top','matched':True}):
            search.return_value.images.return_value = [row]
            with self.assertRaises(app.JobApiError) as caught:
                app.search_outfit(query)
            token = caught.exception.details['reviewToken']
            result = app.search_outfit({'reviewToken':token})
            self.assertEqual(result['pieces'][0]['url'],image)
            self.assertEqual(review.call_args_list[0], review.call_args_list[1])
            self.assertEqual((search.return_value.images.call_count, download.call_count, review.call_count), (1,1,2))

    def test_output_timeout_resumes_job_without_generation(self):
        jobs=app.TryOnJobs(threading.Lock())
        try:
            def wait_state(job_id, status):
                until=time.monotonic()+3
                while time.monotonic()<until:
                    if jobs.get(job_id)['status']==status and not jobs.jobs[job_id].running:
                        return
                    time.sleep(.01)
                self.fail('job did not reach '+status)
            with patch.object(app,'prepare_tryon',return_value=(b'person',[('tops',b'hoodie','model')],'','832*660')), \
                 patch.object(app.cloud,'try_on',return_value=b'new-image') as generate, \
                 patch.object(app,'review_with_retry',side_effect=[timeout(),None]) as review:
                jid=jobs.create({},2)['id']
                wait_state(jid,'error')
                self.assertEqual(jobs.get(jid)['code'],'output_review_pending')
                with self.assertRaises(app.JobApiError):
                    jobs.image(jid)
                jobs.retry_review(jid)
                wait_state(jid,'done')
                self.assertEqual(jobs.image(jid),b'new-image')
                self.assertEqual(review.call_args_list[0],review.call_args_list[1])
                self.assertEqual((generate.call_count,review.call_count),(1,2))
        finally:
            jobs.shutdown()

    def test_uncached_inputs_can_run_concurrently(self):
        barrier=threading.Barrier(2,timeout=2)
        enc=base64.b64encode(b'fixture').decode()
        payload={'person':enc,'garments':[{'category':'tops','image':enc}],'portraitDimensions':[832,660]}
        with patch.object(app,'review_with_retry',side_effect=lambda *_:barrier.wait()),patch.object(app.Image,'open'):
            result=app.prepare_tryon(payload)
        self.assertEqual(result[-1],'832*660')
