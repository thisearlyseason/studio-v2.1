import json
import os
import subprocess
import time
import urllib.request

project = os.environ["FIREBASE_PROJECT_ID"]
assert project == "studio-6850142148-fe343"
token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
endpoint = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/collectionGroups/members/fields/parentId"


def request(url, body=None, method="GET"):
    req = urllib.request.Request(url, method=method, headers={
        "Authorization": "Bearer " + token, "Content-Type": "application/json"
    }, data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def matches(index):
    return index["queryScope"] == "COLLECTION" and any(
        f["fieldPath"] == "parentId" and f.get("order") == "ASCENDING" for f in index["fields"])


indexes = request(endpoint)["indexConfig"]["indexes"]
if not any(map(matches, indexes)):
    updated = [{"queryScope": i["queryScope"], "fields": [f for f in i["fields"] if f["fieldPath"] != "__name__"]} for i in indexes]
    updated.append({"queryScope": "COLLECTION", "fields": [{"fieldPath": "parentId", "order": "ASCENDING"}]})
    request(endpoint + "?updateMask=indexConfig", {"indexConfig": {"indexes": updated}}, "PATCH")

for _ in range(120):
    if any(matches(i) and i.get("state") == "READY" for i in request(endpoint)["indexConfig"]["indexes"]):
        print("Verified the production collection index is ready.")
        break
    time.sleep(5)
else:
    raise RuntimeError("Index did not become ready.")
