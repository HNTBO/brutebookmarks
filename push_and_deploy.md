git add -A
git commit -m "Add server-side JSON storage for bookmarks"
git push origin main



cd /var/www/bookmarks.fmotion.fr
git pull origin main
sudo systemctl restart bookmarks