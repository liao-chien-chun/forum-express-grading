const bcrypt = require('bcryptjs')
const db = require('../models')
const { User, Restaurant, Comment, Favorite, Like, Followship } = db
const { imgurFileHandler } = require('../helpers/file-helpers')
const { getUser } = require('../helpers/auth-helpers')

const userController = {
  signUpPage: (req, res) => {
    res.render('signup')
  },
  signUp: (req, res, next) => {
    // 如果兩次輸入的密碼不同，就建立一個 Error 物件並拋出
    if (req.body.password !== req.body.passwordCheck) throw new Error('Passwords do not match')

    // 確認資料裡面沒有一樣的 email，若有就建立一個 Error 物件並拋出
    User.findOne({ where: { email: req.body.email } })
      .then(user => {
        if (user) throw new Error('Email already exists!')
        return bcrypt.hash(req.body.password, 10)
      })
      .then(hash => User.create({ // 上面狀況都沒發生，就把資料寫入資料庫
        name: req.body.name,
        email: req.body.email,
        password: hash
      }))
      .then(() => {
        req.flash('success_messages', '成功註冊帳號!')
        res.redirect('/signin')
      })
      .catch(err => next(err)) // 接住前面拋出的錯誤，呼叫專門做錯誤處理的 middleware
  },
  signInPage: (req, res) => {
    res.render('signin')
  },
  signIn: (req, res) => {
    req.flash('success_messages', '成功登入！')
    res.redirect('/restaurants')
  },
  logout: (req, res) => {
    req.flash('success_messages', '登出成功！')
    req.logout()
    res.redirect('signin')
  },
  getUser: (req, res, next) => {
    const reqUser = getUser(req)
    const id = req.params.id
    return Promise.all([
      Comment.findAll({
        where: { userId: id }, // 找到留言屬於此user的
        attributes: ['restaurantId'], // 指定回傳欄位
        group: 'restaurantId', // 把他以 restaurantId 分組
        include: Restaurant, // 把關聯資料包含進來
        nest: true,
        raw: true
      }),
      User.findByPk(id, {
        include: [
          { model: Restaurant, as: 'FavoritedRestaurants' },
          { model: User, as: 'Followers' }, // 追蹤我的（粉絲）
          { model: User, as: 'Followings' } // 我追蹤的 追蹤中
        ]
      })
    ])
      .then(([comments, userProfile]) => {
        // 收藏餐廳用FavoritedRestaurants
        // 追蹤我的用Followers, 我追蹤的用Followings
        if (!userProfile) throw new Error("User is didn't exist!")
        res.render('users/profile', {
          user: reqUser,
          userProfile: userProfile.toJSON(),
          comments
        })
      })
      .catch(err => next(err))
  },
  editUser: (req, res, next) => {
    const id = req.params.id
    return User.findByPk(id, {
      raw: true
    })
      .then(user => {
        if (!user) throw new Error("User is didn't exist!")
        res.render('users/edit', { user })
      })
      .catch(err => next(err))
  },
  putUser: (req, res, next) => {
    const { name } = req.body
    if (!name) throw new Error('name is required!')
    const { file } = req // 把檔案取出，也可寫成const file = req.file

    return Promise.all([
      User.findByPk(req.params.id),
      imgurFileHandler(file)
    ])
      .then(([user, filePath]) => {
        if (!user) throw new Error("user didm't exist!")
        return user.update({
          name,
          image: filePath || user.image
        })
      })
      .then(() => {
        req.flash('success_messages', '使用者資料編輯成功')
        res.redirect(`/users/${req.params.id}`)
      })
      .catch(err => next(err))
  },
  addFavorite: (req, res, next) => {
    const { restaurantId } = req.params
    return Promise.all([
      Restaurant.findByPk(restaurantId),
      Favorite.findOne({
        where: {
          userId: req.user.id,
          restaurantId
        }
      })
    ])
      .then(([restaurant, favorite]) => {
        if (!restaurant) throw new Error("Restaurant didn't exist!")
        if (favorite) throw new Error('You have favorited this restaurant!')

        return Favorite.create({
          userId: req.user.id,
          restaurantId
        })
      })
      .then(() => {
        req.flash('success_messages', '成功加入最愛')
        res.redirect('back')
      })
      .catch(err => next(err))
  },
  removeFavorite: (req, res, next) => {
    return Favorite.findOne({
      where: {
        userId: req.user.id,
        restaurantId: req.params.restaurantId
      }
    })
      .then(favorite => {
        if (!favorite) throw new Error("You haven't favorited this restaurant")

        return favorite.destroy()
      })
      .then(() => {
        req.flash('success_messages', '成功移除最愛')
        res.redirect('back')
      })
      .catch(err => next(err))
  },
  addLike: (req, res, next) => {
    const { restaurantId } = req.params
    const userId = req.user.id
    // return Like.findOrCreate({
    //   where: { userId, restaurantId }
    // })
    return Promise.all([
      Restaurant.findByPk(restaurantId),
      Like.findOne({
        where: {
          userId,
          restaurantId
        }
      })
    ])
      .then(([restaurant, like]) => {
        if (!restaurant) throw new Error("Restaurant didn't exist!")
        if (like) throw new Error('You have like this restaurant!')

        return Like.create({
          userId: req.user.id,
          restaurantId
        })
      })
      .then(() => {
        req.flash('success_messages', '已按下喜歡')
        res.redirect('back')
      })
      .catch(err => next(err))
  },
  removeLike: (req, res, next) => {
    return Like.destroy({
      where: {
        userId: req.user.id,
        restaurantId: req.params.restaurantId
      }
    })
    // return Like.findOne({
    //   where: { userId: req.user.id, restaurantId: req.params.restaurantId }
    // })
    //   .then(like => {
    //     if (!like) throw new Error("You haven't like this restaurant")
    //     return like.destroy()
    //   })
      .then(() => {
        req.flash('success_messages', '刪除like成功')
        res.redirect('back')
      })
      .catch(err => next(err))
  },
  getTopUsers: (req, res, next) => {
    // 撈出所有 User 與 followers 資料
    return User.findAll({
      include: [{ model: User, as: 'Followers' }]
    })
      .then(users => {
        const result = users.map(user => ({ // 整理 users 資料，把每個 user 項目都拿出來處理一次，並把新陣列儲存在 users 裡
          // 整理格式
          ...user.toJSON(),
          // 計算追蹤者人數
          followerCount: user.Followers.length,
          // 判斷目前登入使用者是否已追蹤該 user 物件
          // 找到followings的id 是否有等於現在處理中的user的id
          // 去檢查現在登入的人的所有追蹤者中有沒有任何一個人
          isFollowed: req.user.Followings.some(f => f.id === user.id)
        })).sort((a, b) => b.followerCount - a.followerCount)
        res.render('top-users', { users: result })
      })
      .catch(err => next(err))
  },
  addFollowing: (req, res, next) => {
    const { userId } = req.params
    Promise.all([
      User.findByPk(userId),
      Followship.findOne({
        where: {
          followerId: req.user.id,
          followingId: req.params.userId
        }
      })
    ])
      .then(([user, followship]) => {
        if (!user) throw new Error("User didn't exist!")
        if (followship) throw new Error('You are already following this user!')
        return Followship.create({
          followerId: req.user.id,
          followingId: userId
        })
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  },
  removeFollowing: (req, res, next) => {
    Followship.findOne({
      where: {
        followerId: req.user.id,
        followingId: req.params.userId
      }
    })
      .then(followship => {
        if (!followship) throw new Error("You haven't followed this user!")
        return followship.destroy()
      })
      .then(() => res.redirect('back'))
      .catch(err => next(err))
  }
}

module.exports = userController
