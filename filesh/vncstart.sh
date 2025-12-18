#!/bin/bash
## 一键修复 VNC 授权问题并启动 NoVNC + Firefox
## 适用于 Ubuntu

set -e

echo "[1/6] 结束旧的 VNC 会话..."
vncserver -kill :1 >/dev/null 2>&1 || true
vncserver -kill :2 >/dev/null 2>&1 || true

echo "[2/6] 清理旧的 X11 授权文件..."
rm -rf /tmp/.X* ~/.Xauthority
touch ~/.Xauthority

echo "[3/6] 安装桌面环境和依赖..."
sudo apt update
sudo apt install -y xfce4 xfce4-goodies tightvncserver novnc websockify

echo "[4/6] 配置 VNC 启动脚本..."
mkdir -p ~/.vnc
cat > ~/.vnc/xstartup <<EOF
#!/bin/bash
xrdb \$HOME/.Xresources
xhost +
startxfce4 &
EOF
chmod +x ~/.vnc/xstartup

echo "[5/6] 启动 VNC 服务..."
vncserver :1 -geometry 1280x800 -depth 24

echo "      启动 ibus-daemon 服务..."
ibus-daemon -drx

echo "[6/6] 启动 NoVNC (8080端口)..."
websockify -D --web=/usr/share/novnc/ 81 localhost:5901
docker stop v2raya
echo "✅ 搞定！请在本地浏览器打开:"
echo "   http://<你的云服务器IP>:8080/vnc.html"
echo "输入你之前设置的 VNC 密码，就能看到桌面并上网。"