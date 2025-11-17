import json
import os
import time
import requests
import tornado
import traceback
import logging
from jupyter_server.base.handlers import JupyterHandler
from jupyter_server.extension.handler import ExtensionHandlerMixin

logger = logging.getLogger(__name__)

ORCH_BASE = os.getenv('HOST_URL', 'http://localhost:8000').rstrip('/')

# Default fallback user id used when VOC_USERID is not set.
DEFAULT_FALLBACK_USER_ID = 'local_user_x'

STATUS = {
    "Loading": 0,
    "Success": 1,
    "Cancelled": 2,
    "Error": 3
}


class Job:
    def __init__(self, time_limit: int, request_id: int):
        self._time_limit = int(time_limit)
        self._timer = 0
        self._request_id = request_id
        self.status = STATUS["Loading"]
        self.result = None

    @tornado.gen.coroutine
    def run(self):
        while self._timer < self._time_limit:
            if self.status == STATUS["Cancelled"]:
                return
            yield tornado.gen.sleep(1)
            self._timer += 1
            if self._timer % 5 == 0:
                try:
                    resp = requests.get(
                        f"{ORCH_BASE}/ai_hint/query_hint/",
                        params={"request_id": self._request_id},
                        timeout=10,
                    )
                except Exception:
                    self.status = STATUS["Error"]
                    return
                if resp.status_code != 200:
                    self.status = STATUS["Error"]
                    return
                data = resp.json()
                if data.get("job_finished"):
                    self.result = json.dumps({"feedback": data.get("hint")})
                    self.status = STATUS["Success"]
                    return
        self.status = STATUS["Error"]  # Timeout

    def cancel(self):
        self.status = STATUS["Cancelled"]


class RouteHandler(ExtensionHandlerMixin, JupyterHandler):
    @tornado.web.authenticated
    async def get(self, resource):
        try:
            self.set_header("Content-Type", "application/json")
            # Debug: incoming GET to hintbot
            self.log.info(f"hintbot GET called for resource={resource} from {self.request.remote_ip}")
            logger.info(f"hintbot GET called for resource={resource} from {self.request.remote_ip}")
            if resource == "version":
                self.finish(json.dumps("dev"))
            elif resource == "id":
                # Return VOC_USERID if present, otherwise the configured fallback id
                self.finish(json.dumps(os.getenv('VOC_USERID') or DEFAULT_FALLBACK_USER_ID))
            elif resource == "quota_left":
                # Proxy to orchestration to get remaining quota per problem for current student
                try:
                    problem_id = self.get_query_argument("problem_id")
                except Exception:
                    self.set_status(400)
                    self.finish(json.dumps({"message": "Missing problem_id"}))
                    return

                student_id = os.getenv('VOC_USERID') or DEFAULT_FALLBACK_USER_ID

                try:
                    resp = requests.get(
                        f"{ORCH_BASE}/ai_hint/quota_left/",
                        params={
                            "student_id": student_id,
                            "problem_id": problem_id,
                        },
                        timeout=10,
                    )
                except Exception as e:
                    self.log.error(f"Network error proxying quota_left: {e}")
                    self.log.error(traceback.format_exc())
                    self.set_status(500)
                    self.finish(json.dumps({"message": f"Network error: {e}"}))
                    return

                if resp.status_code == 200:
                    try:
                        self.finish(resp.text)
                    except Exception:
                        self.finish(json.dumps(resp.json()))
                else:
                    self.set_status(resp.status_code)
                    try:
                        self.finish(json.dumps(resp.json()))
                    except Exception:
                        self.finish(resp.text)
            elif resource == "has_ever_requested":
                # Return whether current student (from env) has ever requested any hint
                # Use VOC_USERID if available, otherwise fallback to a fixed ID
                student_id = os.getenv('VOC_USERID') or DEFAULT_FALLBACK_USER_ID
                try:
                    resp = requests.get(
                        f"{ORCH_BASE}/ai_hint/has_ever_requested/",
                        params={"student_id": student_id},
                        timeout=10,
                    )
                except Exception as e:
                    self.log.error(f"Network error proxying has_ever_requested: {e}")
                    self.log.error(traceback.format_exc())
                    self.set_status(500)
                    self.finish(json.dumps({"message": f"Network error: {e}"}))
                    return

                self.set_status(resp.status_code)
                try:
                    self.finish(resp.text)
                except Exception:
                    try:
                        self.finish(json.dumps(resp.json()))
                    except Exception:
                        self.finish(resp.text)
            elif resource == "query_all_hint":
                # Return all AI hints for student/problem
                try:
                    problem_id = self.get_query_argument("problem_id")
                except Exception:
                    self.set_status(400)
                    self.finish(json.dumps({"message": "Missing problem_id"}))
                    return
                student_id = os.getenv('VOC_USERID') or DEFAULT_FALLBACK_USER_ID
                try:
                    resp = requests.get(
                        f"{ORCH_BASE}/ai_hint/query_all_hint/",
                        params={"student_id": student_id, "problem_id": problem_id},
                        timeout=10,
                    )
                except Exception as e:
                    self.set_status(500)
                    self.finish(json.dumps({"message": f"Network error: {e}"}))
                    return
                self.set_status(resp.status_code)
                try:
                    self.finish(resp.text)
                except Exception:
                    self.finish(json.dumps(resp.json()))
            elif resource == "query_all_feedback":
                # Return all instructor feedback for student/problem
                try:
                    problem_id = self.get_query_argument("problem_id")
                except Exception:
                    self.set_status(400)
                    self.finish(json.dumps({"message": "Missing problem_id"}))
                    return
                student_id = os.getenv('VOC_USERID') or DEFAULT_FALLBACK_USER_ID
                try:
                    resp = requests.get(
                        f"{ORCH_BASE}/instructor_feedback/query_all_feedback/",
                        params={"student_id": student_id, "problem_id": problem_id},
                        timeout=10,
                    )
                except Exception as e:
                    self.set_status(500)
                    self.finish(json.dumps({"message": f"Network error: {e}"}))
                    return
                self.set_status(resp.status_code)
                try:
                    self.finish(resp.text)
                except Exception:
                    self.finish(json.dumps(resp.json()))
            else:
                self.set_status(404)
        except Exception as e:
            self.log.error(str(e))
            self.set_status(500)
            self.finish(json.dumps(str(e)))

    @tornado.web.authenticated
    async def post(self, resource):
        try:
            # Ensure jobs mapping exists
            if not hasattr(self.extensionapp, 'jobs') or not isinstance(getattr(self.extensionapp, 'jobs'), dict):
                self.extensionapp.jobs = {}
            body = json.loads(self.request.body)
            # Debug: incoming POST to hintbot
            self.log.info(f"hintbot POST called for resource={resource} from {self.request.remote_ip}")
            self.log.debug(f"Request body: {body}")
            logger.info(f"hintbot POST resource={resource} body={body}")
            if resource == "hint":
                hint_type = body.get('hint_type')
                problem_id = body.get('problem_id')
                buggy_notebook_path = body.get('buggy_notebook_path')
                notebook_json = body.get('notebook_json')
                program = body.get('program')
                f = None
                if notebook_json is None and buggy_notebook_path:
                    f = open(buggy_notebook_path, "rb")
                payload = {
                    "student_id": os.getenv('VOC_USERID') or DEFAULT_FALLBACK_USER_ID, 
                    "problem_id": problem_id,
                    "hint_type": hint_type,
                    "student_program": program,
                    "student_notebook": notebook_json if notebook_json is not None else json.load(f),
                }
                if f is not None:
                    f.close()
                # Debug: sending add_request to orchestration
                self.log.info(f"Posting add_request to ORCH_BASE={ORCH_BASE} payload problem_id={problem_id} hint_type={hint_type}")
                try:
                    resp = requests.post(
                        f"{ORCH_BASE}/ai_hint/add_request/",
                        json=payload,
                        timeout=10,
                    )
                except Exception as e:
                    self.log.error(f"Network error posting add_request: {e}")
                    self.log.error(traceback.format_exc())
                    self.set_status(500)
                    self.finish(json.dumps({"error": f"Network error: {e}"}))
                    return
                # Log orchestration response
                try:
                    resp_text = resp.text
                except Exception:
                    resp_text = '<unavailable>'
                self.log.info(f"orchestration add_request returned status={resp.status_code} body={resp_text}")
                # Propagate orchestration response: success -> return request_id, otherwise forward status and body
                if resp.status_code == 200:
                    try:
                        req_id = resp.json().get("request_id")
                    except Exception:
                        req_id = None
                    self.set_header("Content-Type", "application/json")
                    self.write(json.dumps({"request_id": req_id}))
                else:
                    # Forward status code and body from orchestration so client sees exact error (e.g., 429 quota)
                    self.set_status(resp.status_code)
                    # Try to preserve JSON body if possible
                    try:
                        # If orchestration returned JSON text, write it as-is
                        parsed = resp.json()
                        self.finish(json.dumps(parsed))
                    except Exception:
                        # Fallback to raw text
                        self.finish(resp_text)
            elif resource == "reflection":
                request_id = body.get('request_id')
                reflection_question = body.get('reflection_question')
                reflection_answer = body.get('reflection_answer')
                self.log.info(f"Posting add_reflection to ORCH_BASE={ORCH_BASE} for request_id={request_id}")
                try:
                    resp = requests.post(
                        f"{ORCH_BASE}/ai_hint/add_reflection/",
                        json={
                            "request_id": request_id,
                            "reflection_question": reflection_question,
                            "reflection_answer": reflection_answer,
                        },
                        timeout=10,
                    )
                except Exception as e:
                    self.log.error(f"Network error posting add_reflection: {e}")
                    self.log.error(traceback.format_exc())
                    self.set_status(500)
                    self.finish(json.dumps({"error": f"Network error: {e}"}))
                    return
                self.log.info(f"orchestration add_reflection returned status={resp.status_code} body={resp.text}")
                if resp.status_code == 200:
                    newjob = Job(time_limit=240, request_id=request_id)
                    newjob.run()
                    # Ensure jobs mapping exists before storing
                    if not hasattr(self.extensionapp, 'jobs') or not isinstance(getattr(self.extensionapp, 'jobs'), dict):
                        self.extensionapp.jobs = {}
                    self.extensionapp.jobs[str(request_id)] = newjob
                    self.set_header("Content-Type", "application/json")
                    self.write(json.dumps({"request_id": request_id}))
                else:
                    # Forward orchestration error status/body to client
                    self.set_status(resp.status_code)
                    try:
                        parsed = resp.json()
                        self.finish(json.dumps(parsed))
                    except Exception:
                        self.finish(resp.text)
            elif resource == "check":
                request_id = body.get('request_id')
                job = None
                try:
                    job = self.extensionapp.jobs.get(str(request_id))
                except Exception:
                    job = None
                status_value = job.status if job is not None else STATUS["Loading"]
                result_value = job.result if job is not None else None
                self.write({"status": status_value, "result": result_value})
                if job is not None and job.status != STATUS["Loading"]:
                    try:
                        del self.extensionapp.jobs[str(request_id)]
                    except Exception:
                        pass
            elif resource == "cancel":
                request_id = body.get('request_id')
                if request_id is None:
                    self.set_status(400)
                    self.finish(json.dumps({"error": "Missing request_id"}))
                    return

                # Cancel any local job tracking this request
                job = None
                try:
                    job = self.extensionapp.jobs.get(str(request_id))
                except Exception:
                    job = None
                if job is not None:
                    try:
                        job.cancel()
                    except Exception:
                        pass

                # Forward cancellation to orchestration so the request is marked cancelled in DB
                try:
                    resp = requests.post(
                        f"{ORCH_BASE}/ai_hint/cancel_request/",
                        json={"request_id": request_id},
                        timeout=10,
                    )
                except Exception as e:
                    self.log.error(f"Network error posting cancel_request: {e}")
                    self.log.error(traceback.format_exc())
                    self.set_status(500)
                    self.finish(json.dumps({"error": f"Network error: {e}"}))
                    return

                # If orchestration accepted the cancel, return 204; otherwise forward error
                if resp.status_code in (200, 204):
                    self.set_status(204)
                    self.finish()
                else:
                    try:
                        parsed = resp.json()
                        self.set_status(resp.status_code)
                        self.finish(json.dumps(parsed))
                    except Exception:
                        self.set_status(resp.status_code)
                        self.finish(resp.text)
            elif resource == "ta":
                request_id = body.get('request_id')
                student_email = body.get('student_email')
                student_notes = body.get('student_notes')
                problem_id = body.get('problem_id')
                self.log.info(f"Posting instructor_feedback add_request to ORCH_BASE={ORCH_BASE} for request_id={request_id}")
                try:
                    resp = requests.post(
                        f"{ORCH_BASE}/instructor_feedback/add_request/",
                        json={
                            "request_id": request_id,
                            "student_email": student_email,
                            "student_notes": student_notes,
                        },
                        timeout=10,
                    )
                except Exception as e:
                    self.log.error(f"Network error posting instructor add_request: {e}")
                    self.log.error(traceback.format_exc())
                    self.set_status(500)
                    self.finish(json.dumps({"error": f"Network error: {e}"}))
                    return
                self.log.info(f"orchestration instructor add_request returned status={resp.status_code} body={resp.text}")
                if resp.status_code == 200:
                    if not hasattr(self.extensionapp, 'ta_map'):
                        self.extensionapp.ta_map = {}
                    self.extensionapp.ta_map[str(request_id)] = {
                        "student_id": os.getenv('VOC_USERID') or DEFAULT_FALLBACK_USER_ID,
                        "problem_id": problem_id,
                    }
                    self.write({"statusCode": 200})
                elif resp.status_code == 400:
                    self.set_status(400)
                    self.finish(json.dumps({"statusCode": 400, "message": "Error extracting request", "body": resp.text}))
                else:
                    self.set_status(500)
                    self.finish(json.dumps({"statusCode": '', "message": "Unknown error when submitted a request to instructors", "body": resp.text}))
            elif resource == "save_rating":
                # Forward hint rating to orchestration so it is persisted
                try:
                    request_id = int(body.get('request_id'))
                    is_hint_helpful = body.get('is_hint_helpful')
                except Exception as e:
                    self.log.error(f"save_rating: bad payload: {e}")
                    self.set_status(400)
                    self.finish(json.dumps({"error": f"Bad payload: {e}"}))
                    return

                try:
                    resp = requests.post(
                        f"{ORCH_BASE}/ai_hint/save_hint_rating/",
                        json={
                            "request_id": request_id,
                            "is_hint_helpful": bool(is_hint_helpful),
                        },
                        timeout=10,
                    )
                except Exception as e:
                    self.log.error(f"Network error posting save_hint_rating: {e}")
                    self.log.error(traceback.format_exc())
                    self.set_status(500)
                    self.finish(json.dumps({"error": f"Network error: {e}"}))
                    return

                self.log.info(f"orchestration save_hint_rating returned status={resp.status_code} body={resp.text}")
                # orchestration returns 204 on success
                if resp.status_code in (200, 204):
                    # return success to client
                    self.set_status(204)
                    self.finish()
                elif resp.status_code == 400:
                    self.set_status(400)
                    self.finish(json.dumps({"statusCode": 400, "message": "Error extracting request", "body": resp.text}))
                else:
                    self.set_status(500)
                    self.finish(json.dumps({"statusCode": '', "message": "Unknown error when saving hint rating", "body": resp.text}))
            elif resource == "save_feedback_rating":
                # Save instructor feedback rating
                try:
                    instructor_request_id = int(body.get('instructor_request_id'))
                    is_feedback_helpful = body.get('is_feedback_helpful')
                except Exception as e:
                    self.set_status(400)
                    self.finish(json.dumps({"error": f"Bad payload: {e}"}))
                    return

                try:
                    resp = requests.post(
                        f"{ORCH_BASE}/instructor_feedback/save_feedback_rating/",
                        json={
                            "instructor_request_id": instructor_request_id,
                            "is_feedback_helpful": bool(is_feedback_helpful),
                        },
                        timeout=10,
                    )
                except Exception as e:
                    self.set_status(500)
                    self.finish(json.dumps({"error": f"Network error: {e}"}))
                    return

                if resp.status_code in (200, 204):
                    self.set_status(204)
                    self.finish()
                elif resp.status_code == 400:
                    self.set_status(400)
                    self.finish(json.dumps({"statusCode": 400, "message": "Error extracting request", "body": resp.text}))
                else:
                    self.set_status(500)
                    self.finish(json.dumps({"statusCode": '', "message": "Unknown error when saving feedback rating", "body": resp.text}))
            elif resource == "check_ta":
                request_id = body.get('request_id')
                problem_id = body.get('problem_id')
                if not problem_id and hasattr(self.extensionapp, 'ta_map'):
                    problem_id = self.extensionapp.ta_map.get(str(request_id), {}).get('problem_id')
                student_id = os.getenv('VOC_USERID')
                if not (student_id and problem_id):
                    self.write({"statusCode": 400, "message": "Missing identifiers to check instructor feedback"})
                    return
                try:
                    resp = requests.get(
                        f"{ORCH_BASE}/instructor_feedback/query_all_feedback/",
                        params={
                            "student_id": student_id,
                            "problem_id": problem_id,
                        },
                        timeout=10,
                    )
                except Exception as e:
                    self.log.error(f"Network error when checking TA feedback: {e}")
                    self.log.error(traceback.format_exc())
                    self.set_status(500)
                    self.finish(json.dumps({"statusCode": '', "message": f"Network error: {e}"}))
                    return
                if resp.status_code == 200:
                    items = resp.json() or []
                    match = next((x for x in items if str(x.get('ai_hint_request_id')) == str(request_id) and x.get('instructor_feedback')), None)
                    if match:
                        self.write({"statusCode": 200, "feedback_ready": True, "feedback": match.get('instructor_feedback')})
                    else:
                        self.write({"statusCode": 200, "feedback_ready": False})
                elif resp.status_code == 400:
                    self.write({"statusCode": 400, "message": "Error extracting request"})
                else:
                    self.write({"statusCode": '', "message": "Unknown error when submitted a request to instructors"})
            else:
                self.set_status(404)
        except Exception as e:
            self.log.error(str(e))
            self.set_status(500)
            self.finish(json.dumps(str(e)))
