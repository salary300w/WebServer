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

echo "[5/7] 设置 VNC 密码..."
echo "   （注意：VNC 密码最长 8 位，超过将自动截断）"
read -p "  请输入密码（直接回车使用默认密码 372926）: " vnc_pass
if [ -z "$vnc_pass" ]; then
    vnc_pass="372926"
fi
echo "$vnc_pass" | vncpasswd -f > ~/.vnc/passwd 2>/dev/null
chmod 600 ~/.vnc/passwd
echo "  VNC 密码已设置"

echo "[6/7] 启动 VNC 服务..."
vncserver :1 -geometry 1920x1080 -depth 24

echo "      启动 ibus-daemon 服务..."
ibus-daemon -drx

echo "[7/7] 启动 NoVNC (5900端口)..."
websockify -D --web=/usr/share/novnc/ 5900 localhost:5901

echo "✅ 搞定！请在本地浏览器打开:"
echo "   https://<你的云服务器IP>:81/vnc.html"
echo "输入你之前设置的 VNC 密码，就能看到桌面并上网。"
