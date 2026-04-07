# The Ultimate VPS Deployment Guide 🚀

You've chosen **Option B**, which means we are deploying PhotoMind on your own private Virtual Private Server (VPS). This guarantees you zero throttling, massive files sizes, and total control.

Follow these 4 distinct steps to get your app live on the internet.

---

### Step 1: Claim Your Free Oracle Server
Oracle Cloud offers an "Always Free" instance that is incredibly powerful.
1. Go to [Oracle Cloud](https://www.oracle.com/cloud/free/) and sign up.
2. Once logged into the dashboard, click **Create a VM instance**.
3. Under **Image and shape**:
   * Change Image to **Ubuntu 22.04**.
   * Change Shape to **Ampere** (ARM) and drag the sliders to give yourself **4 OCPUs** and **24 GB of RAM** (This is your free limit).
4. Under **Networking**, ensure it assigns a public IPv4 address.
5. Under **Add SSH keys**, make sure you save the private key to your computer! Without this, you cannot log into the server.
6. Click **Create** at the bottom.

---

### Step 2: Open Your Ports
By default, cloud servers block all incoming traffic. We need to open port `3000` so you can access your web app.
1. On your Oracle instance page, click on your **Subnet** link.
2. Click on the **Security List**.
3. Click **Add Ingress Rule**.
4. Set **Source CIDR** to `0.0.0.0/0`.
5. Set **Destination Port Range** to `3000`.
6. Click Add. 

> *Note: Depending on the OS firewall, you might also have to open it via command line internally using `sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT`.*

---

### Step 3: Log Into Your Server
Open your terminal (PowerShell or Mac Terminal) on your local computer and SSH into your new server using the Public IP address Oracle provided you, alongside the SSH key you downloaded.

```bash
# Example SSH command:
ssh -i "path/to/your/ssh-key.key" ubuntu@YOUR-ORACLE-IP-ADDRESS
```

---

### Step 4: Deploy the Code!
You are now inside your server's terminal! Your code is fully prepared in this repo using `docker-compose`. Run these 3 commands exactly as written:

**1. Install Docker**
```bash
sudo apt update
sudo apt install docker.io docker-compose -y
```

**2. Download Your Code**
```bash
git clone https://github.com/Govardhan1201/PHOTODUMP.git
cd PHOTODUMP
```

**3. Launch the Backend & UI**
```bash
sudo docker-compose up --build -d
```

### ✅ Success!
Wait about ~60 seconds for Docker to build the Python packages and Next.js interface. Once it finishes, open the browser on your phone or laptop and go to:
**`http://YOUR-ORACLE-IP-ADDRESS:3000`**

Your full-blown AI photo organizer is now live and yours to use forever!
