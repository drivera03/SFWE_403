# SFWE 403



**Requirements**

 * Docker Desktop 
 * Git




 Confirm that docker is installed
 ```
 docker --version 
 docker compose version
```

 ## Setup
 1. Clone the repo 
 ```
git clone<repo-url>
cd clinical-lab-management-system
```
 2. Make sure Docker Desktop is open and running

 3. Start everything 
```
 docker compose up -d
```
 This builds and start the backend, frontend, and database together

## URLs

* Frontend: http://localhost:5173/
* Backend: http://localhost:8000
* API Docs: http://localhost:8000/docs
* Health Check: http://localhost:8000/health
* DB Check: http://localhost:8000/db-check




## Common Docker commands (All in the terminal)


Start everything 
```
Docker compose up -d 
```
Stop everything
```
docker compose down
```
View logs(all)
```
docker compose logs
```
View logs (one service)
```
docker compose logs <service>
```
Check running containers
```
docker compose ps
```
Rebuild after dependency changes
```
docker compose up -d --build
```

## **Notes**
 
Code changes in the backend and frontend should auto-reload. 

Rebuild only when you add a new package(requirements.txt or package.json changes)

