from fastapi import FastAPI

app = FastAPI()

@app.get("/health")
async def root():
    return {"message" : "Service is running"}